/**
 * POST /api/billing/manage
 * Stripe: returns { url } to Stripe's billing portal (change card, cancel, invoices).
 * Razorpay: cancels at the end of the current cycle and returns { cancelled: true }.
 */
import { razorpayCancel, stripePortal } from "@/lib/server/billing";
import { db, getCaller } from "@/lib/server/guard";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const caller = await getCaller(req);
  if (!caller || caller.dev) return Response.json({ error: "Sign in first." }, { status: 401 });
  const r = await db(`subscriptions?user_id=eq.${caller.id}&select=provider,provider_customer,provider_sub,status`);
  const sub = r.ok ? ((await r.json()) as { provider: string; provider_customer: string | null; provider_sub: string | null; status: string }[])[0] : undefined;
  if (!sub) return Response.json({ error: "No subscription found." }, { status: 404 });
  try {
    if (sub.provider === "stripe") {
      if (!sub.provider_customer) return Response.json({ error: "No Stripe customer on file." }, { status: 404 });
      return Response.json({ url: await stripePortal(sub.provider_customer, new URL(req.url).origin) });
    }
    if (!sub.provider_sub) return Response.json({ error: "No Razorpay subscription on file." }, { status: 404 });
    await razorpayCancel(sub.provider_sub);
    return Response.json({ cancelled: true });
  } catch (e) {
    console.error("[billing/manage]", (e as Error).message);
    return Response.json({ error: "The payment provider didn't respond. Try again in a few minutes." }, { status: 502 });
  }
}
