/**
 * GET /api/auth/confirm?token_hash=…&type=email
 * Where the sign-in link in the email points. The server verifies it and sets the session
 * cookies, so tokens never appear in the address bar or in page JavaScript.
 * Supabase email template: {{ .SiteURL }}/api/auth/confirm?token_hash={{ .TokenHash }}&type=email
 */
import { cloudReady } from "@/lib/server/guard";
import { gotrue, setSession, type Tokens } from "@/lib/server/session";
import { clientIp, fail, gate, logAttempt } from "@/lib/server/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES = new Set(["email", "magiclink", "signup"]);

export async function GET(req: Request) {
  const url = new URL(req.url);
  // A plain Response (not Response.redirect, whose headers are read-only) so the session cookies can be attached.
  const back = (q: string) => new Response(null, { status: 303, headers: { Location: `/app${q}`, "Cache-Control": "no-store" } });
  if (!cloudReady()) return back("");
  const tokenHash = url.searchParams.get("token_hash") ?? "";
  const type = url.searchParams.get("type") ?? "email";
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(tokenHash) || !TYPES.has(type)) return back("?auth=failed");

  const g = await gate(req, "otp_verify", null);
  if (!g.ok) return back("?auth=limited");

  const r = await gotrue<Tokens>("verify", { method: "POST", body: JSON.stringify({ type, token_hash: tokenHash }) });
  if (!r.ok || !r.body.access_token) {
    await fail(req, "otp_verify", null, g.attempts, `link ${r.status}`);
    return back("?auth=failed");
  }
  await setSession(r.body);
  await logAttempt("otp_verify", clientIp(req), null, true, "link");
  return back("");
}
