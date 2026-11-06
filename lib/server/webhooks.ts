/**
 * Turn payment-provider webhook events into subscription rows. Pure functions, tested on their own.
 * Returns null for events that don't change anything.
 *
 * The tier comes from the price (Stripe) or plan (Razorpay) id first, so plan changes made in the
 * provider's own dashboard or portal are picked up; metadata/notes are the fallback. When neither
 * is known (e.g. a cancellation), `plan` is left out so the stored tier is kept.
 */
import type { PlanId } from "@/lib/plans";

type Paid = Exclude<PlanId, "garage">;

export interface SubRow {
  user_id: string | null; // null → look it up by provider_sub
  plan?: Paid;
  status: string;
  provider: "stripe" | "razorpay";
  provider_customer?: string | null;
  provider_sub?: string | null;
  period_end?: string | null;
}

const iso = (unix?: number | null) => (unix ? new Date(unix * 1000).toISOString() : null);
const asTier = (v: unknown): Paid | undefined => (v === "launch" || v === "scale" ? v : undefined);

/* eslint-disable @typescript-eslint/no-explicit-any */
export function fromStripeEvent(evt: any, tierFromPrice: (price?: string | null) => Paid | null = () => null): SubRow | null {
  const o = evt?.data?.object;
  if (!o) return null;
  switch (evt.type) {
    case "checkout.session.completed": {
      if (o.mode !== "subscription") return null;
      const plan = asTier(o.metadata?.tier);
      return {
        user_id: o.client_reference_id ?? o.metadata?.user_id ?? null,
        ...(plan ? { plan } : {}),
        status: "active",
        provider: "stripe",
        provider_customer: o.customer ?? null,
        provider_sub: o.subscription ?? null,
      };
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const item = o.items?.data?.[0];
      const plan = tierFromPrice(item?.price?.id) ?? asTier(o.metadata?.tier);
      return {
        user_id: o.metadata?.user_id ?? null,
        ...(plan ? { plan } : {}),
        status: evt.type === "customer.subscription.deleted" ? "canceled" : String(o.status),
        provider: "stripe",
        provider_customer: o.customer ?? null,
        provider_sub: o.id,
        // Newer Stripe API versions moved the period end onto subscription items.
        period_end: iso(o.current_period_end ?? item?.current_period_end),
      };
    }
    default:
      return null;
  }
}

export function fromRazorpayEvent(evt: any, tierFromPlan: (plan?: string | null) => Paid | null = () => null): SubRow | null {
  const s = evt?.payload?.subscription?.entity;
  if (!s || !String(evt.event ?? "").startsWith("subscription.")) return null;
  const status =
    {
      "subscription.authenticated": "authenticated",
      "subscription.activated": "active",
      "subscription.charged": "active",
      "subscription.resumed": "active",
      "subscription.pending": "past_due",
      "subscription.halted": "halted",
      "subscription.paused": "paused",
      "subscription.cancelled": "canceled",
      "subscription.completed": "canceled",
    }[evt.event as string] ?? null;
  if (!status) return null;
  const plan = tierFromPlan(s.plan_id) ?? asTier(s.notes?.tier);
  return {
    user_id: s.notes?.user_id ?? null,
    ...(plan ? { plan } : {}),
    status,
    provider: "razorpay",
    provider_customer: s.customer_id ?? null,
    provider_sub: s.id,
    period_end: iso(s.current_end),
  };
}
