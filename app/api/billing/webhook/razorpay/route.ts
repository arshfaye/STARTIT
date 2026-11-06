/**
 * POST /api/billing/webhook/razorpay — add this URL in Razorpay → Webhooks with the subscription.*
 * events (activated, charged, pending, halted, cancelled, completed, resumed).
 * Env: RAZORPAY_WEBHOOK_SECRET (the secret you type when creating the webhook).
 */
import { razorpayCancel, tierFromRazorpayPlan, verifyRazorpay } from "@/lib/server/billing";
import { db, upsertSubscription } from "@/lib/server/guard";
import { fromRazorpayEvent } from "@/lib/server/webhooks";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const raw = await req.text(); // must be the exact bytes Razorpay signed
  if (!verifyRazorpay(raw, req.headers.get("x-razorpay-signature"))) return new Response("Invalid signature", { status: 400 });
  const row = fromRazorpayEvent(JSON.parse(raw), tierFromRazorpayPlan);
  if (!row) return Response.json({ received: true, ignored: true });

  let userId = row.user_id;
  if (!userId && row.provider_sub) {
    const r = await db(`subscriptions?provider_sub=eq.${encodeURIComponent(row.provider_sub)}&select=user_id`);
    userId = r.ok ? (((await r.json()) as { user_id: string }[])[0]?.user_id ?? null) : null;
  }
  if (!userId) return Response.json({ received: true, ignored: "no user" });

  // Switching tiers on Razorpay means a new subscription. Once the new one is live, stop the old
  // one immediately so the founder is never billed twice.
  const cur = await db(`subscriptions?user_id=eq.${userId}&select=provider,provider_sub,status`);
  const existing = cur.ok ? ((await cur.json()) as { provider: string; provider_sub: string | null; status: string }[])[0] : undefined;
  if (row.status === "active" && existing?.provider === "razorpay" && existing.provider_sub && existing.provider_sub !== row.provider_sub && existing.status === "active") {
    await razorpayCancel(existing.provider_sub, false).catch((e) => console.warn("Could not cancel old Razorpay subscription:", e));
  }
  // Events about an old, replaced subscription must not overwrite the new one.
  if (existing?.provider_sub && row.provider_sub && existing.provider_sub !== row.provider_sub && row.status !== "active") {
    return Response.json({ received: true, ignored: "stale subscription" });
  }
  await upsertSubscription({ ...row, user_id: userId });
  return Response.json({ received: true });
}
