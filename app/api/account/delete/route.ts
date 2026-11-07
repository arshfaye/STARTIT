/**
 * POST /api/account/delete — permanently deletes the signed-in founder's account.
 * Required by the App Store (guideline 5.1.1(v)) and Google Play for apps with sign-up.
 *
 * 1. Cancels any paid subscription immediately, so nobody is billed after deleting.
 * 2. Deletes the Supabase user. Every table references auth.users with ON DELETE CASCADE, so the
 *    workspace, usage, subscription row, push devices and reminder log go with it.
 */
import { razorpayCancel, stripeCancelNow } from "@/lib/server/billing";
import { cloudReady, db, getCaller } from "@/lib/server/guard";
import { clearSession } from "@/lib/server/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!cloudReady()) return Response.json({ ok: true, local: true }); // nothing stored on a server
  const caller = await getCaller(req);
  if (!caller || caller.dev) return Response.json({ error: "Sign in again, then try deleting." }, { status: 401 });

  const r = await db(`subscriptions?user_id=eq.${caller.id}&select=provider,provider_sub,status`);
  const sub = r.ok ? ((await r.json()) as { provider: string; provider_sub: string | null; status: string }[])[0] : undefined;
  if (sub?.provider_sub && !["canceled", "cancelled", "completed"].includes(sub.status)) {
    try {
      if (sub.provider === "stripe") await stripeCancelNow(sub.provider_sub);
      else if (sub.provider === "razorpay") await razorpayCancel(sub.provider_sub, false);
    } catch (e) {
      // Don't delete the account while it can still be charged.
      return Response.json({ error: `Couldn't cancel your subscription: ${(e as Error).message}. Nothing was deleted. Try again or contact support.` }, { status: 502 });
    }
  }

  const del = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${caller.id}`, {
    method: "DELETE",
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!del.ok && del.status !== 404) return Response.json({ error: `Couldn't delete the account (${del.status}).` }, { status: 502 });
  clearSession();
  return Response.json({ ok: true });
}
