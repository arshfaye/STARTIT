/**
 * POST /api/auth/verify  { email, code, captcha? }
 * Checks the emailed code and starts a session in httpOnly cookies. Codes expire 10 minutes after
 * they're sent. Wrong codes are logged, slowed down and count toward the account lockout.
 */
import { gotrue, needsMfa, sessionUserFromToken, setSession, type Tokens } from "@/lib/server/session";
import { EMAIL_RE, json, preflight, readBody } from "@/lib/server/http";
import { clientIp, fail, gate, lastCodeSent, logAttempt, OTP_TTL_MS } from "@/lib/server/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WRONG = "That code is wrong or has expired. Check the latest email or request a new code.";

export async function POST(req: Request) {
  const body = await readBody<{ email?: string; code?: string; captcha?: string }>(req);
  const stop = preflight(req, body);
  if (stop) return stop;
  const email = String(body!.email ?? "").trim().toLowerCase();
  const code = String(body!.code ?? "").trim();
  if (!EMAIL_RE.test(email) || !/^\d{6}$/.test(code)) return json({ error: "Enter the 6-digit code from the email.", code: "bad_request" }, 400);

  const g = await gate(req, "otp_verify", email, body!.captcha);
  if (!g.ok) return g.response;

  const sent = await lastCodeSent(email).catch(() => null);
  if (!sent || Date.now() - sent > OTP_TTL_MS) {
    await fail(req, "otp_verify", email, g.attempts, "expired");
    return json({ error: "That code has expired. Request a new one.", code: "expired" }, 400);
  }

  const r = await gotrue<Tokens>("verify", { method: "POST", body: JSON.stringify({ type: "email", email, token: code }) });
  if (!r.ok || !r.body.access_token) {
    await fail(req, "otp_verify", email, g.attempts, `gotrue ${r.status}`);
    return json({ error: WRONG, code: "wrong_code" }, 400);
  }
  setSession(r.body);
  await logAttempt("otp_verify", clientIp(req), email, true);
  const u = await sessionUserFromToken(r.body.access_token);
  return json({ ok: true, mfaRequired: !!u && needsMfa(u) });
}
