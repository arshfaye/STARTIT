/**
 * Server-side sessions.
 *
 * Supabase tokens never reach page JavaScript. The server signs in on the founder's behalf and
 * keeps the access and refresh tokens in httpOnly, Secure, SameSite=Strict cookies, so a script
 * injected into the page (XSS) can't read or steal them. Every API route reads the session from
 * those cookies, refreshing the access token when it's about to expire.
 *
 * State-changing requests must also come from this site (Origin check), which together with
 * SameSite=Strict blocks cross-site request forgery.
 */
import { cookies } from "next/headers";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Server-only: the browser never talks to Supabase, so the key isn't shipped to it.
const ANON = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const ACCESS_COOKIE = "__Host-startit-at";
export const REFRESH_COOKIE = "__Host-startit-rt";
/** Refresh tokens rotate on every use; a session that's idle this long must sign in again. */
export const REFRESH_MAX_AGE = 60 * 60 * 24 * 14;

export interface Tokens {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
}

export interface SessionUser {
  id: string;
  email: string;
  /** Authenticator level of this session: aal2 means 2FA was completed. */
  aal: "aal1" | "aal2";
  /** Verified authenticator-app factors on the account. */
  factors: { id: string; status: string; factor_type: string }[];
  accessToken: string;
}

/** Cookie attributes for a session cookie. `__Host-` requires Secure, Path=/ and no Domain. */
export function cookieOptions(maxAge: number) {
  return { httpOnly: true, secure: true, sameSite: "strict" as const, path: "/", maxAge };
}

/** Reads the claims of a JWT that the auth server has already validated (we never trust it before that). */
export function jwtClaims(token: string): { exp?: number; aal?: string; sub?: string } {
  try {
    const part = token.split(".")[1];
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return {};
  }
}

/**
 * Requests that change something must come from this site. Browsers always send Origin on
 * cross-site and same-site POST/PUT/DELETE fetches, so a missing or foreign Origin is refused.
 */
export function sameOrigin(req: Request): boolean {
  if (req.method === "GET" || req.method === "HEAD") return true;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function setSession(t: Tokens) {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, t.access_token, cookieOptions(Math.max(60, t.expires_in ?? 3600)));
  jar.set(REFRESH_COOKIE, t.refresh_token, cookieOptions(REFRESH_MAX_AGE));
}

export async function clearSession() {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, "", cookieOptions(0));
  jar.set(REFRESH_COOKIE, "", cookieOptions(0));
}

export async function gotrue<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<{ ok: boolean; status: number; body: T }> {
  const { token, ...rest } = init;
  const r = await fetch(`${SB}/auth/v1/${path}`, {
    ...rest,
    headers: { apikey: ANON!, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(rest.headers ?? {}) },
    cache: "no-store",
  });
  const body = (await r.json().catch(() => ({}))) as T;
  return { ok: r.ok, status: r.status, body };
}

/** The access token from the cookies, refreshed (and the cookies rotated) when it's within a minute of expiring. */
async function accessToken(): Promise<string | null> {
  if (!SB || !ANON) return null;
  const jar = await cookies();
  const at = jar.get(ACCESS_COOKIE)?.value;
  if (at && (jwtClaims(at).exp ?? 0) * 1000 > Date.now() + 60_000) return at;
  const rt = jar.get(REFRESH_COOKIE)?.value;
  if (!rt) return null;
  const r = await gotrue<Tokens>("token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: rt }) });
  if (!r.ok || !r.body.access_token) {
    await clearSession();
    return null;
  }
  await setSession(r.body);
  return r.body.access_token;
}

/** Who's signed in, checked with the auth server on every call (a revoked session stops working at once). */
export async function sessionUser(): Promise<SessionUser | null> {
  const token = await accessToken();
  return token ? sessionUserFromToken(token) : null;
}

/** The user behind a specific access token (e.g. one just issued), validated by the auth server. */
export async function sessionUserFromToken(token: string): Promise<SessionUser | null> {
  const r = await gotrue<{ id?: string; email?: string; factors?: SessionUser["factors"] }>("user", { token });
  if (!r.ok || !r.body.id) return null;
  return {
    id: r.body.id,
    email: r.body.email ?? "",
    aal: jwtClaims(token).aal === "aal2" ? "aal2" : "aal1",
    factors: (r.body.factors ?? []).filter((f) => f.factor_type === "totp"),
    accessToken: token,
  };
}

/** The account has an authenticator app turned on, but this session hasn't passed it yet. */
export const needsMfa = (u: SessionUser) => u.factors.some((f) => f.status === "verified") && u.aal !== "aal2";
