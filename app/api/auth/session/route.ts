/**
 * GET /api/auth/session
 * What the app needs to know about the signed-in user. Never returns a token.
 */
import { cloudReady, isAdmin } from "@/lib/server/guard";
import { json } from "@/lib/server/http";
import { backupCodesLeft } from "@/lib/server/mfa";
import { captchaConfigured } from "@/lib/server/ratelimit";
import { needsMfa, sessionUser } from "@/lib/server/session";
import { effectivePlan } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!cloudReady()) return json({ configured: false, signedIn: false });
  const u = await sessionUser();
  const base = { configured: true, captchaSiteKey: captchaConfigured() ? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY : null };
  if (!u) return json({ ...base, signedIn: false });
  const enabled = u.factors.some((f) => f.status === "verified");
  const admin = isAdmin({ id: u.id, email: u.email, plan: effectivePlan(null), aal: u.aal, mfa: enabled, accessToken: "" });
  return json({
    ...base,
    signedIn: true,
    id: u.id,
    email: u.email,
    mfa: { enabled, needed: needsMfa(u), backupCodesLeft: enabled && !needsMfa(u) ? await backupCodesLeft(u.id) : null, requiredForAdmin: admin },
  });
}
