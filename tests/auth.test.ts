/**
 * Sign-in security: cookie sessions, CSRF, rate limits, lockout, CAPTCHA, OTP expiry,
 * backup codes, admin middleware and encrypted-only storage. Supabase and Cloudflare are faked.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { jar } from "./setup";

Object.assign(process.env, {
  NODE_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: "https://sb.test",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  AUTH_HASH_SECRET: "pepper",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "site",
  TURNSTILE_SECRET_KEY: "secret",
  ADMIN_EMAILS: "boss@startit.test",
});

const RL = await import("@/lib/server/ratelimit");
const MFA = await import("@/lib/server/mfa");
const S = await import("@/lib/server/session");
const { requireAdmin } = await import("@/lib/server/guard");
const verifyRoute = (await import("@/app/api/auth/verify/route")).POST;
const otpRoute = (await import("@/app/api/auth/otp/route")).POST;
const workspaceRoute = (await import("@/app/api/workspace/route")).PUT;

const tok = (claims: Record<string, unknown>) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
const USER = tok({ sub: "u1", exp: 4102444800, aal: "aal1" });
const BOSS1 = tok({ sub: "b1", exp: 4102444800, aal: "aal1" });
const BOSS2 = tok({ sub: "b1", exp: 4102444800, aal: "aal2" });

/* ---------------------------------------------------------- fake backend -- */

type Ev = { at: string; action: string; ok: boolean; account: string | null; ip_hash: string; detail: string | null };
let events: Ev[] = [];
let validCode = "123456";

beforeEach(() => {
  events = [];
  jar.clear();
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const u = new URL(String(url));
    const method = init?.method ?? "GET";
    const headers = (init?.headers ?? {}) as Record<string, string>;
    let body: Record<string, unknown> = {};
    try {
      body = init?.body ? JSON.parse(String(init.body)) : {};
    } catch {}
    if (u.pathname === "/rest/v1/auth_events" && method === "POST") {
      events.push({ at: new Date().toISOString(), detail: null, ...body });
      return new Response(null, { status: 201 });
    }
    if (u.pathname === "/rest/v1/auth_events") {
      const action = u.searchParams.get("action")?.replace("eq.", "");
      const or = u.searchParams.get("or") ?? "";
      const ip = or.match(/ip_hash\.eq\.([^,)]+)/)?.[1] ?? u.searchParams.get("ip_hash")?.replace("eq.", "");
      const acct = decodeURIComponent(or.match(/account\.eq\.("[^"]*"|[^,)]+)/)?.[1] ?? u.searchParams.get("account")?.replace("eq.", "") ?? "").replace(/^"|"$/g, "");
      const okOnly = u.searchParams.get("ok") === "eq.true";
      const rows = events.filter((e) => e.action === action && (e.ip_hash === ip || (acct && e.account === acct)) && (!okOnly || e.ok)).reverse();
      return Response.json(rows);
    }
    if (u.pathname === "/auth/v1/otp") return Response.json({});
    if (u.pathname === "/auth/v1/verify") {
      return body.token === validCode ? Response.json({ access_token: USER, refresh_token: "r1", expires_in: 3600 }) : Response.json({ msg: "bad" }, { status: 403 });
    }
    if (u.pathname === "/auth/v1/user") {
      const t = headers.Authorization?.replace("Bearer ", "");
      if (t === USER) return Response.json({ id: "u1", email: "a@b.co", factors: [] });
      if (t === BOSS1 || t === BOSS2) return Response.json({ id: "b1", email: "boss@startit.test", factors: [{ id: "f1", status: "verified", factor_type: "totp" }] });
      return new Response("no", { status: 401 });
    }
    if (u.pathname.startsWith("/rest/v1/subscriptions")) return Response.json([]);
    if (u.hostname === "challenges.cloudflare.com") return Response.json({ success: String(init?.body).includes("response=human") });
    if (u.pathname === "/rest/v1/workspaces") return new Response(null, { status: 201 });
    return new Response("unexpected " + u.pathname, { status: 500 });
  }) as typeof fetch;
});

const post = (path: string, body: unknown, headers: Record<string, string> = {}, cookie?: string) => {
  jar.delete(S.ACCESS_COOKIE);
  if (cookie) jar.set(S.ACCESS_COOKIE, { value: cookie, opts: {} });
  return new Request(`https://app.test${path}`, {
    method: "POST",
    headers: { origin: "https://app.test", host: "app.test", "x-real-ip": "203.0.113.7", "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
};

/* ---------------------------------------------------------------- tests -- */

describe("rate-limit rules", () => {
  const now = Date.now();
  const a = (minsAgo: number, ok: boolean, byIp = true, byAccount = true) => ({ at: now - minsAgo * 60_000, ok, byIp, byAccount });

  test("5 attempts per IP per 15 minutes", () => {
    expect(RL.decide([a(1, true), a(2, true), a(3, true), a(4, true)], now).allow).toBe(true);
    const d = RL.decide([a(1, true), a(2, true), a(3, true), a(4, true), a(14, true)], now);
    expect(d).toMatchObject({ allow: false, reason: "ip_limit" });
    expect(RL.decide([a(1, true), a(2, true), a(3, true), a(4, true), a(16, true)], now).allow).toBe(true);
  });

  test("CAPTCHA after 3 failures", () => {
    expect(RL.decide([a(1, false), a(2, false)], now).captcha).toBe(false);
    expect(RL.decide([a(1, false, false), a(2, false, false), a(3, false, false)], now).captcha).toBe(true);
  });

  test("account lockout after 5 failures, doubling each time", () => {
    const five = [a(1, false, false), a(30, false, false), a(60, false, false), a(90, false, false), a(120, false, false)];
    const d5 = RL.decide(five, now);
    expect(d5).toMatchObject({ allow: false, reason: "locked" });
    expect((d5 as { retryAfterMs: number }).retryAfterMs).toBeCloseTo(14 * 60_000, -3);
    const d6 = RL.decide([a(1, false, false), ...five.map((x) => ({ ...x, at: x.at - 60_000 }))], now);
    expect((d6 as { retryAfterMs: number }).retryAfterMs).toBeCloseTo(29 * 60_000, -3);
    expect(RL.decide(five.map((x) => ({ ...x, at: x.at - 20 * 60_000 })), now).allow).toBe(true);
  });

  test("failed answers are slowed down exponentially, up to 4 seconds", () => {
    expect(RL.failureDelayMs(0)).toBe(250);
    expect(RL.failureDelayMs(2)).toBe(1000);
    expect(RL.failureDelayMs(10)).toBe(4000);
  });
});

describe("email code sign-in", () => {
  const send = () => otpRoute(post("/api/auth/otp", { email: "a@b.co" }));
  const verify = (code: string, extra: Record<string, unknown> = {}) => verifyRoute(post("/api/auth/verify", { email: "a@b.co", code, ...extra }));

  test("a correct code sets httpOnly, Secure, SameSite=Strict cookies and returns no token", async () => {
    await send();
    const r = await verify("123456");
    expect(r.status).toBe(200);
    const text = await r.text();
    expect(text).not.toContain(USER);
    expect(text).not.toContain("r1");
    const at = jar.get(S.ACCESS_COOKIE)!;
    expect(at.value).toBe(USER);
    expect(at.opts).toMatchObject({ httpOnly: true, secure: true, sameSite: "strict", path: "/" });
    expect(jar.get(S.REFRESH_COOKIE)?.opts.httpOnly).toBe(true);
  });

  test("wrong codes are logged, then need a CAPTCHA, then lock the account", async () => {
    await send();
    for (let i = 0; i < 3; i++) expect((await verify("000000")).status).toBe(400);
    expect(events.filter((e) => e.action === "otp_verify" && !e.ok)).toHaveLength(3);
    expect(events.every((e) => !e.ip_hash.includes("203.0.113.7"))).toBe(true); // IP only stored hashed

    const needCaptcha = await verify("000000");
    expect(needCaptcha.status).toBe(403);
    expect((await needCaptcha.json()).code).toBe("captcha_required");

    expect((await verify("000000", { captcha: "human" })).status).toBe(400);
    expect((await verify("000000", { captcha: "human" })).status).toBe(400);
    const locked = await verify("123456", { captcha: "human" });
    expect(locked.status).toBe(429);
    expect((await locked.json()).code).toBe("locked");
  }, 20_000);

  test("refused attempts don't extend someone else's lockout", async () => {
    await send();
    for (let i = 0; i < 3; i++) await verify("000000");
    for (let i = 0; i < 10; i++) await verify("000000"); // no CAPTCHA: refused, not counted
    const counted = events.filter((e) => e.action === "otp_verify" && !e.ok && !(e.detail ?? "").startsWith("refused:"));
    expect(counted).toHaveLength(3);
  }, 20_000);

  test("codes expire 10 minutes after they're sent", async () => {
    events.push({ at: new Date(Date.now() - 11 * 60_000).toISOString(), action: "otp_send", ok: true, account: "a@b.co", ip_hash: "x", detail: null });
    const r = await verify("123456");
    expect(r.status).toBe(400);
    expect((await r.json()).code).toBe("expired");
  });

  test("IP limit on sending codes: 5 per 15 minutes", async () => {
    const codes = [];
    for (let i = 0; i < 6; i++) codes.push((await otpRoute(post("/api/auth/otp", { email: `p${i}@b.co` }))).status);
    expect(codes.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(codes[5]).toBe(429);
  });

  test("passwords are refused outright", async () => {
    const r = await otpRoute(post("/api/auth/otp", { email: "a@b.co", password: "password123" }));
    expect(r.status).toBe(400);
    expect((await r.json()).code).toBe("no_passwords");
  });

  test("cross-site sign-in requests are refused", async () => {
    expect((await otpRoute(post("/api/auth/otp", { email: "a@b.co" }, { origin: "https://evil.example" }))).status).toBe(403);
  });
});

describe("input that reaches the database", () => {
  test("filter values are quoted, so brackets and commas can't change a query", () => {
    const v = decodeURIComponent(RL.pgValue('x),ip_hash.eq.zzz,"q\\'));
    expect(v).toBe('"x),ip_hash.eq.zzz,\\"q\\\\"');
  });
  test("odd email addresses are refused before any lookup", async () => {
    for (const email of ["a),ip_hash.eq.x@b.co", 'a"b@c.co', "a@b", "<script>@x.co"]) {
      expect((await otpRoute(post("/api/auth/otp", { email }))).status).toBe(400);
    }
  });
});

describe("links built from data", async () => {
  const { safeUrl } = await import("@/lib/safeUrl");
  test("only http(s) links survive", () => {
    expect(safeUrl("https://news.ycombinator.com/item?id=1")).toBe("https://news.ycombinator.com/item?id=1");
    expect(safeUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeUrl(" JaVaScRiPt:alert(1)")).toBeUndefined();
    expect(safeUrl("data:text/html,<script>")).toBeUndefined();
    expect(safeUrl("not a url")).toBeUndefined();
  });
});

describe("backup codes", () => {
  test("random, readable, stored only as salted hashes", () => {
    const codes = Array.from({ length: 50 }, MFA.newBackupCode);
    expect(new Set(codes).size).toBe(50);
    for (const c of codes) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
    const h = MFA.hashBackupCode(codes[0], "salt1");
    expect(h).not.toContain(codes[0].replace("-", ""));
    expect(MFA.hashBackupCode(codes[0], "salt2")).not.toBe(h);
    expect(MFA.matchesBackupCode(codes[0].toLowerCase().replace("-", " "), "salt1", h)).toBe(true);
    expect(MFA.matchesBackupCode(codes[1], "salt1", h)).toBe(false);
  });
});

describe("admin middleware", () => {
  const call = (cookie: string | undefined) => requireAdmin(post("/api/revenue/sync", {}, {}, cookie));
  test("signed out → 401, non-admin → 403", async () => {
    expect(((await call(undefined)) as Response).status).toBe(401);
    expect(((await call(USER)) as Response).status).toBe(403);
  });
  test("an admin who hasn't passed 2FA this session can't get in", async () => {
    // BOSS1 is aal1 on an account with an authenticator: refused as not signed in at all.
    expect(((await call(BOSS1)) as Response).status).toBe(401);
  });
  test("an admin with 2FA completed is allowed", async () => {
    expect(await call(BOSS2)).not.toBeInstanceOf(Response);
  });
});

describe("storage", () => {
  test("the server refuses to store a workspace that isn't encrypted", async () => {
    const r = await workspaceRoute(new Request("https://app.test/api/workspace", { method: "PUT", headers: { origin: "https://app.test", host: "app.test" }, body: JSON.stringify({ data: { idea: { name: "plain" } } }) }).clone() as Request);
    expect([400, 401]).toContain(r.status);
    jar.set(S.ACCESS_COOKIE, { value: USER, opts: {} });
    const r2 = await workspaceRoute(new Request("https://app.test/api/workspace", { method: "PUT", headers: { origin: "https://app.test", host: "app.test" }, body: JSON.stringify({ data: { idea: { name: "plain" } } }) }));
    expect(r2.status).toBe(400);
    expect((await r2.json()).code).toBe("not_encrypted");
    const r3 = await workspaceRoute(new Request("https://app.test/api/workspace", { method: "PUT", headers: { origin: "https://app.test", host: "app.test" }, body: JSON.stringify({ data: { v: 1, alg: "A256GCM", iv: "aa", ct: "bb" } }) }));
    expect(r3.status).toBe(200);
  });
});

describe("session helpers", () => {
  test("only same-site requests may change things", () => {
    const r = (h: Record<string, string>, method = "POST") => new Request("https://app.test/x", { method, headers: { host: "app.test", ...h } });
    expect(S.sameOrigin(r({ origin: "https://app.test" }))).toBe(true);
    expect(S.sameOrigin(r({ origin: "https://evil.example" }))).toBe(false);
    expect(S.sameOrigin(r({}))).toBe(false);
    expect(S.sameOrigin(r({}, "GET"))).toBe(true);
  });
  test("cookie attributes", () => {
    expect(S.cookieOptions(60)).toEqual({ httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 60 });
    expect(S.ACCESS_COOKIE.startsWith("__Host-")).toBe(true);
  });
});
