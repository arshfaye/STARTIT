/**
 * Backup codes for two-step verification.
 *
 * Ten random one-time codes are shown once when the authenticator app is turned on. Only a
 * salted HMAC of each is stored, so a database leak doesn't reveal them. Using one proves the
 * founder is the account owner when their phone is lost: it removes the authenticator so they can
 * sign in and set it up again. Each code works once.
 */
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { db } from "./guard";

const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789"; // no 0/O, 1/I/L
export const BACKUP_CODE_COUNT = 10;

/** 10 characters from a 30-letter alphabet ≈ 49 bits each, shown as XXXXX-XXXXX. */
export function newBackupCode(): string {
  let s = "";
  for (let i = 0; i < 10; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

export const normalizeCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, "");

const pepper = () => process.env.AUTH_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "startit";

export function hashBackupCode(code: string, salt: string): string {
  return createHmac("sha256", pepper()).update(`${salt}:${normalizeCode(code)}`).digest("hex");
}

export function matchesBackupCode(code: string, salt: string, hash: string): boolean {
  const a = Buffer.from(hashBackupCode(code, salt), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Replace the account's backup codes with a fresh set. Returns the plain codes to show once. */
export async function issueBackupCodes(userId: string): Promise<string[]> {
  const codes = Array.from({ length: BACKUP_CODE_COUNT }, newBackupCode);
  const del = await db(`mfa_backup_codes?user_id=eq.${userId}`, { method: "DELETE" });
  if (!del.ok) throw new Error(`Could not reset backup codes (${del.status})`);
  const rows = codes.map((c) => {
    const salt = randomBytes(16).toString("hex");
    return { user_id: userId, salt, code_hash: hashBackupCode(c, salt) };
  });
  const ins = await db("mfa_backup_codes", { method: "POST", body: JSON.stringify(rows) });
  if (!ins.ok) throw new Error(`Could not save backup codes (${ins.status})`);
  return codes;
}

/** Use up one backup code. True if it was valid and unused. */
export async function redeemBackupCode(userId: string, code: string): Promise<boolean> {
  const r = await db(`mfa_backup_codes?user_id=eq.${userId}&used_at=is.null&select=id,salt,code_hash`);
  if (!r.ok) throw new Error(`Could not read backup codes (${r.status})`);
  const rows = (await r.json()) as { id: number; salt: string; code_hash: string }[];
  const hit = rows.find((x) => matchesBackupCode(code, x.salt, x.code_hash));
  if (!hit) return false;
  // Only one request can mark it used: the filter on used_at makes this atomic.
  const u = await db(`mfa_backup_codes?id=eq.${hit.id}&used_at=is.null`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ used_at: new Date().toISOString() }) });
  return u.ok && ((await u.json()) as unknown[]).length === 1;
}

export async function backupCodesLeft(userId: string): Promise<number> {
  const r = await db(`mfa_backup_codes?user_id=eq.${userId}&used_at=is.null&select=id`);
  return r.ok ? ((await r.json()) as unknown[]).length : 0;
}

/** Remove every authenticator factor on the account (service role), e.g. after a backup code is used. */
export async function removeAllFactors(userId: string, factorIds: string[]) {
  for (const id of factorIds) {
    const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${userId}/factors/${id}`, {
      method: "DELETE",
      headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
    });
    if (!r.ok && r.status !== 404) throw new Error(`Could not remove the authenticator (${r.status})`);
  }
  await db(`mfa_backup_codes?user_id=eq.${userId}`, { method: "DELETE" });
}
