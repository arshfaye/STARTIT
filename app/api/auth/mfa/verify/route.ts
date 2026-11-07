/**
 * POST /api/auth/mfa/verify  { factorId?, code, captcha? }
 * Signing in: checks the authenticator code and upgrades the session to aal2.
 * Finishing setup (an unverified factor): the same, then issues 10 backup codes, shown once.
 */
import { json, preflight, readBody } from "@/lib/server/http";
import { issueBackupCodes } from "@/lib/server/mfa";
import { clientIp, fail, gate, logAttempt } from "@/lib/server/ratelimit";
import { sessionUser } from "@/lib/server/session";
import { verifyTotp } from "@/lib/server/totp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await readBody<{ factorId?: string; code?: string; captcha?: string }>(req);
  const stop = preflight(req, body);
  if (stop) return stop;
  const u = await sessionUser();
  if (!u) return json({ error: "Your session ended. Sign in again.", code: "unauthorized" }, 401);
  const code = String(body!.code ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return json({ error: "Enter the 6-digit code from your authenticator app.", code: "bad_request" }, 400);

  const verified = u.factors.find((f) => f.status === "verified");
  const factor = body!.factorId ? u.factors.find((f) => f.id === body!.factorId) : verified;
  if (!factor) return json({ error: "Start two-step setup again.", code: "no_factor" }, 400);

  const g = await gate(req, "mfa_verify", u.email, body!.captcha);
  if (!g.ok) return g.response;

  if (!(await verifyTotp(u, factor.id, code))) {
    await fail(req, "mfa_verify", u.email, g.attempts, "wrong_totp");
    return json({ error: "That code didn't match. Use the current code from your authenticator app.", code: "wrong_code" }, 400);
  }
  await logAttempt("mfa_verify", clientIp(req), u.email, true, factor.status === "verified" ? "signin" : "enrolled");
  if (factor.status !== "verified") {
    const codes = await issueBackupCodes(u.id);
    return json({ ok: true, enrolled: true, backupCodes: codes });
  }
  return json({ ok: true });
}
