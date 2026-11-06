/**
 * Talking to Stripe and Razorpay (server only), plus webhook signature checks.
 * Both are called with plain fetch so there are no SDK version surprises.
 */
import type { PlanId } from "@/lib/plans";
import { hmacMatches } from "./guard";

type Paid = Exclude<PlanId, "garage">;

/** Price/plan ids per tier, from env. Used for checkout and to read the tier back from webhooks. */
export const STRIPE_PRICES: Record<Paid, string | undefined> = { launch: process.env.STRIPE_PRICE_LAUNCH, scale: process.env.STRIPE_PRICE_SCALE };
export const RAZORPAY_PLANS: Record<Paid, string | undefined> = { launch: process.env.RAZORPAY_PLAN_LAUNCH, scale: process.env.RAZORPAY_PLAN_SCALE };
export const tierFromStripePrice = (price?: string | null): Paid | null => (Object.entries(STRIPE_PRICES).find(([, p]) => p && p === price)?.[0] as Paid) ?? null;
export const tierFromRazorpayPlan = (plan?: string | null): Paid | null => (Object.entries(RAZORPAY_PLANS).find(([, p]) => p && p === plan)?.[0] as Paid) ?? null;

/* ---------------------------------------------------------------- Stripe -- */

const STRIPE = process.env.STRIPE_SECRET_KEY;

async function stripe<T>(path: string, form: Record<string, string>): Promise<T> {
  if (!STRIPE) throw new Error("Stripe isn't configured.");
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${STRIPE}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  const body = (await r.json()) as T & { error?: { message?: string } };
  if (!r.ok) throw new Error(body.error?.message ?? `Stripe error ${r.status}`);
  return body;
}

export async function stripeCheckout(userId: string, email: string, origin: string, tier: Paid) {
  const price = STRIPE_PRICES[tier];
  if (!STRIPE || !price) throw new Error(`Stripe billing isn't configured for ${tier} (STRIPE_PRICE_${tier.toUpperCase()}).`);
  const s = await stripe<{ url: string }>("checkout/sessions", {
    mode: "subscription",
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    success_url: `${origin}/?billing=success#accountability`,
    cancel_url: `${origin}/?billing=cancelled`,
    client_reference_id: userId,
    customer_email: email,
    "subscription_data[metadata][user_id]": userId,
    "subscription_data[metadata][tier]": tier,
    "metadata[user_id]": userId,
    "metadata[tier]": tier,
    allow_promotion_codes: "true",
  });
  return s.url;
}

/** Cancel straight away (used when an account is deleted). */
export async function stripeCancelNow(subscriptionId: string) {
  if (!STRIPE) throw new Error("Stripe isn't configured.");
  const r = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: "DELETE", headers: { Authorization: `Bearer ${STRIPE}` } });
  if (!r.ok && r.status !== 404) throw new Error(`Stripe cancel failed (${r.status})`);
}

export async function stripePortal(customer: string, origin: string) {
  const s = await stripe<{ url: string }>("billing_portal/sessions", { customer, return_url: origin });
  return s.url;
}

/** Stripe-Signature: "t=<unix>,v1=<hex>[,v1=…]". Rejects anything older than 5 minutes. */
export function verifyStripe(payload: string, header: string | null, secret = process.env.STRIPE_WEBHOOK_SECRET, now = Date.now()): boolean {
  if (!header || !secret) return false;
  const parts = header.split(",").map((p) => p.split("=") as [string, string]);
  const t = parts.find(([k]) => k === "t")?.[1];
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || !sigs.length || Math.abs(now / 1000 - Number(t)) > 300) return false;
  return sigs.some((s) => /^[0-9a-f]+$/i.test(s) && hmacMatches(secret, `${t}.${payload}`, s));
}

/* -------------------------------------------------------------- Razorpay -- */

function rzpAuth() {
  const id = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!id || !secret) throw new Error("Razorpay isn't configured (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET).");
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

async function razorpay<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`https://api.razorpay.com/v1/${path}`, { method: "POST", headers: { Authorization: rzpAuth(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = (await r.json()) as T & { error?: { description?: string } };
  if (!r.ok) throw new Error(j.error?.description ?? `Razorpay error ${r.status}`);
  return j;
}

/** Creates a subscription and returns Razorpay's hosted payment link. */
export async function razorpayCheckout(userId: string, email: string, tier: Paid) {
  const plan = RAZORPAY_PLANS[tier];
  if (!plan) throw new Error(`Razorpay billing isn't configured for ${tier} (RAZORPAY_PLAN_${tier.toUpperCase()}).`);
  const sub = await razorpay<{ id: string; short_url: string }>("subscriptions", {
    plan_id: plan,
    total_count: 120, // up to 10 years of monthly renewals; the founder can cancel any time
    customer_notify: 1,
    notes: { user_id: userId, email, tier },
  });
  return { url: sub.short_url, subscriptionId: sub.id };
}

export async function razorpayCancel(subscriptionId: string, atCycleEnd = true) {
  await razorpay(`subscriptions/${subscriptionId}/cancel`, { cancel_at_cycle_end: atCycleEnd ? 1 : 0 });
}

/** X-Razorpay-Signature is the hex HMAC-SHA256 of the raw body with the webhook secret. */
export function verifyRazorpay(payload: string, header: string | null, secret = process.env.RAZORPAY_WEBHOOK_SECRET): boolean {
  if (!header || !secret || !/^[0-9a-f]+$/i.test(header)) return false;
  return hmacMatches(secret, payload, header);
}
