/**
 * POST /api/auth/mfa/backup  { code, captcha? }
 * Lost phone: a backup code proves it's you. It's used up, and the authenticator is removed so you
 * can sign in and set two-step verification up again (admins must, before admin features work).
 */
import { json, preflight, readBody } from "@/lib/server/http";
import { redeemBackupCode, removeAllFactors } from "@/lib/server/mfa";
import { clientIp, fail, gate, logAttempt } from "@/lib/server/ratelimit";
import { needsMfa, sessionUser } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await readBody<{ code?: string; captcha?: string }>(req);
  const stop = preflight(req, body);
  if (stop) return stop;
  const u = await sessionUser();
  if (!u) return json({ error: "Your session ended. Sign in again.", code: "unauthorized" }, 401);
  if (!needsMfa(u)) return json({ error: "Two-step verification isn't blocking this session.", code: "bad_request" }, 400);
  const code = String(body!.code ?? "");
  if (code.replace(/[^A-Za-z0-9]/g, "").length !== 10) return json({ error: "Backup codes look like ABCDE-FGH23.", code: "bad_request" }, 400);

  const g = await gate(req, "backup_code", u.email, body!.captcha);
  if (!g.ok) return g.response;

  const ok = await redeemBackupCode(u.id, code).catch(() => false);
  if (!ok) {
    await fail(req, "backup_code", u.email, g.attempts, "wrong_backup_code");
    return json({ error: "That backup code isn't valid or was already used.", code: "wrong_code" }, 400);
  }
  await removeAllFactors(u.id, u.factors.map((f) => f.id));
  await logAttempt("backup_code", clientIp(req), u.email, true, "factor_removed");
  return json({ ok: true, reenroll: true });
}
