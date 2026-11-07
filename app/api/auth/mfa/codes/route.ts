/** POST /api/auth/mfa/codes — replaces your backup codes with 10 new ones (old ones stop working). Needs a 2FA session. */
import { getCaller } from "@/lib/server/guard";
import { json, preflight, readBody } from "@/lib/server/http";
import { issueBackupCodes } from "@/lib/server/mfa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await readBody(req);
  const stop = preflight(req, body);
  if (stop) return stop;
  const caller = await getCaller(req);
  if (!caller || !caller.mfa || caller.aal !== "aal2") return json({ error: "Sign in with your authenticator first.", code: "unauthorized" }, 401);
  return json({ backupCodes: await issueBackupCodes(caller.id) });
}
