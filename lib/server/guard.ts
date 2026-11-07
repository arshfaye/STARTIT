/**
 * Server-only helpers: who is calling, what plan they're on, and whether they still have quota.
 * Every route that costs money (AI, search, provider sync) goes through `guard()`.
 *
 * Who's calling comes only from the httpOnly session cookies (lib/server/session.ts), checked
 * with the auth server on every request. State-changing requests must come from this site, and
 * an account with two-step verification must have completed it in this session.
 *
 * Production requires Supabase. In local development without Supabase, requests run as a
 * "dev" user with no limits so you can build without setting anything up.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { effectivePlan, LIMITS, nextTierFor, QUOTA_LABEL, tier, type PlanId, type QuotaKind, type Subscription } from "@/lib/plans";
import { needsMfa, sameOrigin, sessionUser } from "./session";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Server-only: the browser never talks to Supabase, so the key isn't shipped to it.
const ANON = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEV = process.env.NODE_ENV !== "production";
export const cloudReady = () => !!(SB && ANON && SERVICE);

export interface Caller {
  id: string;
  email: string;
  plan: PlanId;
  /** aal2 = two-step verification completed in this session. */
  aal: "aal1" | "aal2";
  /** The account has an authenticator app turned on. */
  mfa: boolean;
  /** The user's own access token, for database calls that must go through row-level security. */
  accessToken: string;
  dev?: boolean;
}

export const db = (path: string, init: RequestInit = {}) =>
  fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { apikey: SERVICE!, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });

/**
 * The signed-in founder, or null. Null too when the request came from another site, or when the
 * account has two-step verification that this session hasn't completed.
 */
export async function getCaller(req: Request): Promise<Caller | null> {
  if (!cloudReady()) return DEV ? { id: "dev", email: "dev@localhost", plan: "scale", aal: "aal2", mfa: true, accessToken: "", dev: true } : null;
  if (!sameOrigin(req)) return null;
  const u = await sessionUser();
  if (!u || needsMfa(u)) return null;
  return { id: u.id, email: u.email, aal: u.aal, mfa: u.factors.some((f) => f.status === "verified"), accessToken: u.accessToken, plan: effectivePlan(await getSubscription(u.id)) };
}

export async function getSubscription(userId: string): Promise<Subscription | null> {
  const r = await db(`subscriptions?user_id=eq.${userId}&select=plan,status,provider,period_end`);
  if (!r.ok) return null;
  const row = ((await r.json()) as { plan: PlanId; status: string; provider: Subscription["provider"]; period_end: string | null }[])[0];
  return row ? { plan: row.plan, status: row.status, provider: row.provider, periodEnd: row.period_end } : null;
}

export async function upsertSubscription(row: { user_id: string; plan?: PlanId; status: string; provider: "stripe" | "razorpay"; provider_customer?: string | null; provider_sub?: string | null; period_end?: string | null }) {
  const r = await db("subscriptions", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ ...row, updated_at: new Date().toISOString() }) });
  if (!r.ok) throw new Error(`Could not save subscription (${r.status}): ${await r.text()}`);
}

/** Atomically spend one unit of today's quota. Returns false when the limit is reached. */
export async function spend(caller: Caller, kind: QuotaKind): Promise<{ allowed: boolean; used: number; limit: number }> {
  const limit = LIMITS[caller.plan][kind];
  if (caller.dev) return { allowed: true, used: 0, limit };
  const r = await db("rpc/use_quota", { method: "POST", body: JSON.stringify({ p_user: caller.id, p_kind: kind, p_limit: limit }) });
  if (!r.ok) throw new Error(`Quota check failed (${r.status})`);
  const row = ((await r.json()) as { allowed: boolean; used: number }[])[0];
  return { allowed: !!row?.allowed, used: row?.used ?? limit, limit };
}

export async function usageToday(userId: string): Promise<Partial<Record<QuotaKind, number>>> {
  const day = new Date().toISOString().slice(0, 10);
  const r = await db(`usage?user_id=eq.${userId}&day=eq.${day}&select=kind,count`);
  if (!r.ok) return {};
  return Object.fromEntries(((await r.json()) as { kind: QuotaKind; count: number }[]).map((x) => [x.kind, x.count]));
}

const json = (body: unknown, status: number) => Response.json(body, { status });

/**
 * Use at the top of a paid route:
 *   const g = await guard(req, "chat"); if (g instanceof Response) return g;
 */
export async function guard(req: Request, kind: QuotaKind): Promise<Caller | Response> {
  if (!cloudReady() && !DEV) return json({ error: "Accounts aren't set up on this server yet.", code: "not_configured" }, 503);
  const caller = await getCaller(req);
  if (!caller) return json({ error: "Sign in to use this.", code: "unauthorized" }, 401);
  const q = await spend(caller, kind).catch(() => null);
  if (!q) return json({ error: "Couldn't check your usage. Try again.", code: "upstream_error" }, 503);
  if (!q.allowed) {
    const next = nextTierFor(caller.plan, kind);
    const name = tier(caller.plan).name;
    const error =
      q.limit === 0
        ? `${QUOTA_LABEL[kind]} are part of ${next ? tier(next).name : "a higher plan"}.`
        : `You've used all ${q.limit} ${QUOTA_LABEL[kind].toLowerCase().replace(/\bai\b/g, "AI")} for today on ${name}.`;
    return json({ error, code: "limit_reached", plan: caller.plan, limit: q.limit, kind, suggest: next }, 429);
  }
  return caller;
}

/** Comma-separated ADMIN_EMAILS may use server-wide integrations (e.g. syncing your own Stripe). Decided only here, on the server. */
export const isAdmin = (c: Caller) => c.dev || (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean).includes(c.email.toLowerCase());

/**
 * Middleware for every admin route: signed in, on the admin list, and two-step verification
 * completed in this session. Admins can't use admin features without an authenticator app.
 *   const a = await requireAdmin(req); if (a instanceof Response) return a;
 */
export async function requireAdmin(req: Request): Promise<Caller | Response> {
  if (!cloudReady() && !DEV) return json({ error: "Accounts aren't set up on this server yet.", code: "not_configured" }, 503);
  const caller = await getCaller(req);
  if (!caller) return json({ error: "Sign in first.", code: "unauthorized" }, 401);
  if (!isAdmin(caller)) {
    console.warn(`[auth] non-admin ${caller.email} tried an admin route ${new URL(req.url).pathname}`);
    return json({ error: "Only the owner of this server can do that.", code: "forbidden" }, 403);
  }
  if (!caller.dev && caller.aal !== "aal2") return json({ error: "Turn on two-step verification in Settings to use admin features.", code: "admin_mfa_required" }, 403);
  return caller;
}

/** Constant-time HMAC-SHA256 hex comparison for webhook signatures. */
export function hmacMatches(secret: string, payload: string, expectedHex: string) {
  const mac = createHmac("sha256", secret).update(payload).digest("hex");
  const a = Buffer.from(mac, "hex");
  const b = Buffer.from(expectedHex, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
