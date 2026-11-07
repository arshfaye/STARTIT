/**
 * POST /api/auth/mfa/disable  { code, captcha? }
 * Turns two-step verification off after re-checking a current code. Admins can't turn it off.
 */
import { getCaller, isAdmin } from "@/lib/server/guard";
import { json, preflight, readBody } from "@/lib/server/http";
import { removeAllFactors } from "@/lib/server/mfa";
import { clientIp, fail, gate, logAttempt } from "@/lib/server/ratelimit";
import { sessionUser } from "@/lib/server/session";
import { verifyTotp } from "@/lib/server/totp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await readBody<{ code?: string; captcha?: string }>(req);
  const stop = preflight(req, body);
  if (stop) return stop;
  const caller = await getCaller(req);
  const u = await sessionUser();
  if (!caller || !u || u.aal !== "aal2") return json({ error: "Sign in with your authenticator first.", code: "unauthorized" }, 401);
  if (isAdmin(caller)) return json({ error: "Admins have to keep two-step verification on.", code: "admin_mfa_required" }, 403);
  const factor = u.factors.find((f) => f.status === "verified");
  if (!factor) return json({ ok: true });
  const code = String(body!.code ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return json({ error: "Enter the current 6-digit code to confirm.", code: "bad_request" }, 400);

  const g = await gate(req, "mfa_verify", u.email, body!.captcha);
  if (!g.ok) return g.response;
  if (!(await verifyTotp(u, factor.id, code))) {
    await fail(req, "mfa_verify", u.email, g.attempts, "wrong_totp_disable");
    return json({ error: "That code didn't match.", code: "wrong_code" }, 400);
  }
  await removeAllFactors(u.id, u.factors.map((f) => f.id));
  await logAttempt("mfa_verify", clientIp(req), u.email, true, "disabled");
  return json({ ok: true });
}
