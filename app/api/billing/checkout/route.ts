/**
 * POST /api/billing/checkout  { country, tier: "launch" | "scale" }  → { url }
 * India → Razorpay (INR: UPI, cards, netbanking). Everywhere else → Stripe.
 *
 * Upgrading Launch → Scale:
 *   Stripe   → sends the founder to the billing portal, which switches the plan with proration.
 *   Razorpay → creates a new subscription; the webhook cancels the old one once the new one is live.
 */
import { atLeast, billingProviderFor, tier as tierInfo, type PlanId } from "@/lib/plans";
import { razorpayCheckout, stripeCheckout, stripePortal } from "@/lib/server/billing";
import { cloudReady, db, getCaller } from "@/lib/server/guard";
import { isNativeRequest } from "@/lib/platform";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!cloudReady()) return Response.json({ error: "Billing needs accounts (Supabase) set up first." }, { status: 501 });
  // Store apps must use Apple / Google billing for in-app subscriptions; web checkout isn't offered there.
  if (isNativeRequest(req)) return Response.json({ error: "Plans can't be bought in the app." }, { status: 403 });
  const caller = await getCaller(req);
  if (!caller) return Response.json({ error: "Sign in to upgrade." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { country?: string; tier?: string };
  const tier = body.tier === "scale" ? "scale" : body.tier === "launch" ? "launch" : null;
  if (!tier) return Response.json({ error: "Pick Launch or Scale." }, { status: 400 });
  if (atLeast(caller.plan, tier)) return Response.json({ error: `You're already on ${tierInfo(caller.plan as PlanId).name}.` }, { status: 409 });

  const provider = billingProviderFor(String(body.country ?? "").toUpperCase());
  const origin = new URL(req.url).origin;
  const cur = await db(`subscriptions?user_id=eq.${caller.id}&select=provider,provider_customer,provider_sub,status`);
  const existing = cur.ok ? ((await cur.json()) as { provider: string; provider_customer: string | null; provider_sub: string | null; status: string }[])[0] : undefined;
  const upgrading = caller.plan !== "garage";

  try {
    if (upgrading && existing?.provider === "stripe" && existing.provider_customer) {
      // Stripe's portal changes the price on the existing subscription; the webhook picks up the new tier.
      return Response.json({ url: await stripePortal(existing.provider_customer, origin), provider: "stripe", portal: true });
    }
    if (provider === "razorpay" || (upgrading && existing?.provider === "razorpay")) {
      const { url, subscriptionId } = await razorpayCheckout(caller.id, caller.email, tier);
      if (!upgrading) {
        // First purchase: remember the pending subscription so webhooks can be matched to this founder.
        // (On upgrades the current paid row must stay, so the webhook can cancel it once the new one is live.)
        await db("subscriptions", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates" },
          body: JSON.stringify({ user_id: caller.id, plan: "garage", status: "pending", provider: "razorpay", provider_sub: subscriptionId, updated_at: new Date().toISOString() }),
        });
      }
      return Response.json({ url, provider: "razorpay" });
    }
    return Response.json({ url: await stripeCheckout(caller.id, caller.email, origin, tier), provider: "stripe" });
  } catch (e) {
    console.error("[billing/checkout]", (e as Error).message);
    return Response.json({ error: "Checkout couldn't start. Try again in a few minutes." }, { status: 502 });
  }
}
