/**
 * POST /api/auth/otp  { email, captcha? }
 * Emails a 6-digit sign-in code (and a sign-in link). Rate limited per IP, CAPTCHA after repeated
 * failures. The answer is the same whether or not the account exists.
 */
import { gotrue } from "@/lib/server/session";
import { EMAIL_RE, json, preflight, readBody } from "@/lib/server/http";
import { clientIp, gate, logAttempt } from "@/lib/server/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await readBody<{ email?: string; captcha?: string }>(req);
  const stop = preflight(req, body);
  if (stop) return stop;
  const email = String(body!.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return json({ error: "Enter a valid email address.", code: "bad_request" }, 400);

  const g = await gate(req, "otp_send", email, body!.captcha);
  if (!g.ok) return g.response;

  const r = await gotrue<{ msg?: string; error_description?: string }>("otp", { method: "POST", body: JSON.stringify({ email, create_user: true }) });
  if (!r.ok) {
    await logAttempt("otp_send", clientIp(req), email, false, `gotrue ${r.status}`);
    if (r.status === 429) return json({ error: "A code was sent very recently. Wait a minute, then try again.", code: "ip_limit" }, 429);
    return json({ error: "Couldn't send the code. Try again shortly.", code: "upstream_error" }, 502);
  }
  await logAttempt("otp_send", clientIp(req), email, true);
  return json({ ok: true });
}
