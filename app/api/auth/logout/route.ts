/** POST /api/auth/logout — ends the session on the auth server and clears the cookies. */
import { json } from "@/lib/server/http";
import { clearSession, gotrue, sameOrigin, sessionUser } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Request refused.", code: "bad_origin" }, 403);
  const u = await sessionUser().catch(() => null);
  if (u) await gotrue("logout?scope=local", { method: "POST", token: u.accessToken }).catch(() => {});
  clearSession();
  return json({ ok: true });
}
