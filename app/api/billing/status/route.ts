/**
 * GET /api/billing/status → { plan, status, provider, periodEnd, usage, limits, billing }
 * `billing` says which payment providers are configured, so the app knows whether to offer upgrades.
 */
import { effectivePlan, LIMITS } from "@/lib/plans";
import { cloudReady, getCaller, getSubscription, usageToday } from "@/lib/server/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Which tiers can actually be bought on this server, per provider.
  const billing = {
    stripe: { launch: !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_LAUNCH), scale: !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_SCALE) },
    razorpay: {
      launch: !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_PLAN_LAUNCH),
      scale: !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_PLAN_SCALE),
    },
  };
  const caller = await getCaller(req);
  if (!caller) return Response.json({ ok: true, signedIn: false, billing });
  if (caller.dev || !cloudReady()) return Response.json({ ok: true, signedIn: true, dev: true, plan: "scale", usage: {}, limits: LIMITS.scale, billing });
  const sub = await getSubscription(caller.id);
  const plan = effectivePlan(sub);
  return Response.json({
    ok: true,
    signedIn: true,
    plan,
    status: sub?.status ?? null,
    provider: sub?.provider ?? null,
    periodEnd: sub?.periodEnd ?? null,
    usage: await usageToday(caller.id),
    limits: LIMITS[plan],
    billing,
  });
}
