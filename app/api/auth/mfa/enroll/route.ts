/** POST /api/auth/mfa/enroll — starts authenticator-app setup. Returns a QR code and the secret to type in. */
import { json, preflight, readBody } from "@/lib/server/http";
import { needsMfa, sessionUser } from "@/lib/server/session";
import { enrollTotp } from "@/lib/server/totp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await readBody(req);
  const stop = preflight(req, body);
  if (stop) return stop;
  const u = await sessionUser();
  if (!u || needsMfa(u)) return json({ error: "Sign in first.", code: "unauthorized" }, 401);
  if (u.factors.some((f) => f.status === "verified")) return json({ error: "Two-step verification is already on.", code: "exists" }, 409);
  try {
    return json(await enrollTotp(u));
  } catch (e) {
    console.error("[auth/mfa/enroll]", (e as Error).message);
    return json({ error: "Couldn't start setup. Try again in a minute.", code: "upstream_error" }, 502);
  }
}
