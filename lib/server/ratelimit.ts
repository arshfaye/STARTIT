/**
 * Brute-force protection for every sign-in step.
 *
 * - Per IP: at most 5 attempts per action in any 15 minutes.
 * - Per account: after 5 failures in 24 hours the account is locked, for 15 minutes the first
 *   time and twice as long after every further failure (exponential backoff, capped at 24 hours).
 * - CAPTCHA (Cloudflare Turnstile) is required once there have been 3 failures in 15 minutes
 *   from that IP or on that account.
 * - Failed answers are also slowed down server-side (250 ms, doubling, up to 4 s).
 * - Every attempt, failed or not, is logged to `auth_events` (IP stored only as a keyed hash) and
 *   failures to the server log.
 *
 * The rules are a pure function (`decide`) so they can be tested; storage is Postgres via the
 * service role, shared by every server instance. If the log can't be read, sign-in fails closed.
 */
import { createHmac } from "crypto";
import { db } from "./guard";

export type AuthAction = "otp_send" | "otp_verify" | "mfa_verify" | "backup_code";

export const WINDOW_MS = 15 * 60 * 1000;
export const IP_LIMIT = 5;
export const CAPTCHA_AFTER = 3;
export const LOCK_AFTER = 5;
export const LOCK_BASE_MS = 15 * 60 * 1000;
export const LOCK_MAX_MS = 24 * 60 * 60 * 1000;

export interface Attempt {
  at: number; // ms
  ok: boolean;
  byIp: boolean; // came from this IP
  byAccount: boolean; // was for this account
}

export type Decision = { allow: true; captcha: boolean } | { allow: false; reason: "ip_limit" | "locked"; retryAfterMs: number; captcha: boolean };

/** What to do with a new attempt, given recent attempts for this action from this IP or for this account. */
export function decide(attempts: Attempt[], now: number): Decision {
  const recent = attempts.filter((a) => now - a.at < WINDOW_MS);
  const ipRecent = recent.filter((a) => a.byIp).sort((a, b) => a.at - b.at);
  const failsRecent = recent.filter((a) => !a.ok);
  const captcha = failsRecent.filter((a) => a.byIp).length >= CAPTCHA_AFTER || failsRecent.filter((a) => a.byAccount).length >= CAPTCHA_AFTER;

  // Account lockout with exponential backoff, counted over 24 hours.
  const accountFails = attempts.filter((a) => a.byAccount && !a.ok && now - a.at < LOCK_MAX_MS).sort((a, b) => a.at - b.at);
  if (accountFails.length >= LOCK_AFTER) {
    const lockMs = Math.min(LOCK_MAX_MS, LOCK_BASE_MS * 2 ** (accountFails.length - LOCK_AFTER));
    const until = accountFails[accountFails.length - 1].at + lockMs;
    if (until > now) return { allow: false, reason: "locked", retryAfterMs: until - now, captcha: true };
  }
  if (ipRecent.length >= IP_LIMIT) return { allow: false, reason: "ip_limit", retryAfterMs: ipRecent[0].at + WINDOW_MS - now, captcha };
  return { allow: true, captcha };
}

/** Delay before answering a failed attempt: 250 ms, doubling with each recent failure, up to 4 s. */
export const failureDelayMs = (recentFailures: number) => Math.min(4000, 250 * 2 ** Math.max(0, recentFailures));

export function clientIp(req: Request): string {
  return (req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim();
}

/** IPs are personal data: only a keyed hash is stored. */
export function ipHash(ip: string): string {
  return createHmac("sha256", process.env.AUTH_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "startit").update(ip).digest("hex").slice(0, 32);
}

const normEmail = (e: string) => e.trim().toLowerCase();

/** Recent attempts at this action from this IP or for this account. Throws if the log can't be read (fail closed). */
export async function recentAttempts(action: AuthAction, ip: string, account: string | null, now = Date.now()): Promise<Attempt[]> {
  const since = new Date(now - LOCK_MAX_MS).toISOString();
  const h = ipHash(ip);
  const who = account ? `or=(ip_hash.eq.${h},account.eq.${encodeURIComponent(normEmail(account))})` : `ip_hash=eq.${h}`;
  // Refusals (rate limited, locked, CAPTCHA missing) are logged but never counted: otherwise an
  // attacker could keep someone else's account locked just by hammering it.
  const r = await db(`auth_events?select=at,ok,ip_hash,account,detail&action=eq.${action}&at=gte.${since}&${who}&order=at.desc&limit=200`);
  if (!r.ok) throw new Error(`auth_events read failed (${r.status})`);
  const rows = (await r.json()) as { at: string; ok: boolean; ip_hash: string; account: string | null; detail: string | null }[];
  return rows.filter((x) => !(x.detail ?? "").startsWith("refused:")).map((x) => ({ at: Date.parse(x.at), ok: x.ok, byIp: x.ip_hash === h, byAccount: !!account && x.account === normEmail(account) }));
}

export async function logAttempt(action: AuthAction, ip: string, account: string | null, ok: boolean, detail = "") {
  if (!ok) console.warn(`[auth] failed ${action} account=${account ? normEmail(account) : "-"} ip=${ipHash(ip).slice(0, 8)} ${detail}`);
  await db("auth_events", {
    method: "POST",
    body: JSON.stringify({ action, ok, account: account ? normEmail(account) : null, ip_hash: ipHash(ip), detail: detail.slice(0, 200) }),
  }).catch(() => {});
}

/** When the last code was sent to this address (for our own 10-minute expiry on email codes). */
export async function lastCodeSent(account: string): Promise<number | null> {
  const r = await db(`auth_events?select=at&action=eq.otp_send&ok=eq.true&account=eq.${encodeURIComponent(normEmail(account))}&order=at.desc&limit=1`);
  if (!r.ok) throw new Error(`auth_events read failed (${r.status})`);
  const row = ((await r.json()) as { at: string }[])[0];
  return row ? Date.parse(row.at) : null;
}

export const OTP_TTL_MS = 10 * 60 * 1000;

/* ------------------------------------------------------------- CAPTCHA -- */

export const captchaConfigured = () => !!(process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

/** Verifies a Cloudflare Turnstile token with Cloudflare. */
export async function verifyCaptcha(token: string | undefined, ip: string): Promise<boolean> {
  if (!token || !captchaConfigured()) return false;
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY!, response: token, remoteip: ip }),
  }).catch(() => null);
  if (!r?.ok) return false;
  return !!((await r.json()) as { success?: boolean }).success;
}

/* --------------------------------------------------------------- gate -- */

const minutes = (ms: number) => Math.max(1, Math.ceil(ms / 60000));

export type Gate = { ok: true; attempts: Attempt[] } | { ok: false; response: Response };

/**
 * Run at the top of every sign-in step. Checks the IP and account limits and, when needed,
 * the CAPTCHA. A request that's refused here is logged as a failure too.
 */
export async function gate(req: Request, action: AuthAction, account: string | null, captchaToken?: string): Promise<Gate> {
  const ip = clientIp(req);
  let attempts: Attempt[];
  try {
    attempts = await recentAttempts(action, ip, account);
  } catch (e) {
    console.error("[auth] rate limit store unavailable:", (e as Error).message);
    return { ok: false, response: Response.json({ error: "Sign-in is unavailable for a moment. Try again shortly.", code: "unavailable" }, { status: 503 }) };
  }
  const d = decide(attempts, Date.now());
  if (!d.allow) {
    await logAttempt(action, ip, account, false, `refused:${d.reason}`);
    const mins = minutes(d.retryAfterMs);
    const error = d.reason === "locked" ? `Too many wrong codes for this account. Try again in ${mins} minute${mins > 1 ? "s" : ""}.` : `Too many attempts from your network. Try again in ${mins} minute${mins > 1 ? "s" : ""}.`;
    return { ok: false, response: Response.json({ error, code: d.reason, retryAfter: Math.ceil(d.retryAfterMs / 1000) }, { status: 429, headers: { "Retry-After": String(Math.ceil(d.retryAfterMs / 1000)) } }) };
  }
  if (d.captcha) {
    if (!captchaConfigured()) {
      // No CAPTCHA keys: treat as a short lockout rather than letting the attempt through.
      await logAttempt(action, ip, account, false, "refused:captcha_unconfigured");
      return { ok: false, response: Response.json({ error: "Too many failed attempts. Try again in 15 minutes.", code: "locked", retryAfter: 900 }, { status: 429, headers: { "Retry-After": "900" } }) };
    }
    if (!(await verifyCaptcha(captchaToken, ip))) {
      await logAttempt(action, ip, account, false, captchaToken ? "refused:captcha_failed" : "refused:captcha_required");
      return { ok: false, response: Response.json({ error: "Confirm you're human to continue.", code: "captcha_required", siteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY }, { status: 403 }) };
    }
  }
  return { ok: true, attempts };
}

/** Record a failed answer and slow the response down before replying. */
export async function fail(req: Request, action: AuthAction, account: string | null, attempts: Attempt[], detail: string) {
  await logAttempt(action, clientIp(req), account, false, detail);
  const recentFails = attempts.filter((a) => !a.ok && Date.now() - a.at < WINDOW_MS).length;
  await new Promise((r) => setTimeout(r, failureDelayMs(recentFails)));
}
