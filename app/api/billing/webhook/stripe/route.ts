/**
 * POST /api/billing/webhook/stripe — add this URL as a webhook endpoint in Stripe with the events:
 * checkout.session.completed, customer.subscription.created/updated/deleted.
 * Env: STRIPE_WEBHOOK_SECRET (whsec_…).
 */
import { tierFromStripePrice, verifyStripe } from "@/lib/server/billing";
import { db, upsertSubscription } from "@/lib/server/guard";
import { fromStripeEvent } from "@/lib/server/webhooks";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const raw = await req.text(); // must be the exact bytes Stripe signed
  if (!verifyStripe(raw, req.headers.get("stripe-signature"))) return new Response("Invalid signature", { status: 400 });
  const row = fromStripeEvent(JSON.parse(raw), tierFromStripePrice);
  if (!row) return Response.json({ received: true, ignored: true });

  let userId = row.user_id;
  if (!userId && row.provider_sub) {
    const r = await db(`subscriptions?provider_sub=eq.${encodeURIComponent(row.provider_sub)}&select=user_id`);
    userId = r.ok ? (((await r.json()) as { user_id: string }[])[0]?.user_id ?? null) : null;
  }
  if (!userId) return Response.json({ received: true, ignored: "no user" });
  await upsertSubscription({ ...row, user_id: userId });
  return Response.json({ received: true });
}
