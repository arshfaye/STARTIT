/**
 * Server-side security: webhook signatures, plan mapping, usage limits, account deletion.
 * Supabase, Stripe and Razorpay are faked by replacing `fetch`, so no keys or network are needed.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { createHmac } from "crypto";
import { jar } from "./setup";

/** A JWT-shaped token; the fake auth server decides whether it's valid. */
const tok = (claims: Record<string, unknown>) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
const GOOD = tok({ sub: "u1", exp: 4102444800, aal: "aal1" });
const FORGED = tok({ sub: "u1", exp: 4102444800, aal: "aal2" });

// Environment must be set before the server modules load (they read it at import time).
Object.assign(process.env, {
  NODE_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: "https://sb.test",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  STRIPE_SECRET_KEY: "sk",
  STRIPE_WEBHOOK_SECRET: "whsec_test",
  STRIPE_PRICE_LAUNCH: "price_L",
  STRIPE_PRICE_SCALE: "price_S",
  RAZORPAY_KEY_ID: "k",
  RAZORPAY_KEY_SECRET: "s",
  RAZORPAY_WEBHOOK_SECRET: "rzp_secret",
  RAZORPAY_PLAN_LAUNCH: "plan_L",
  RAZORPAY_PLAN_SCALE: "plan_S",
});

const B = await import("@/lib/server/billing");
const W = await import("@/lib/server/webhooks");
const { guard } = await import("@/lib/server/guard");
const deleteAccount = (await import("@/app/api/account/delete/route")).POST;
const checkout = (await import("@/app/api/billing/checkout/route")).POST;

/* ---------------------------------------------------------- fake backend -- */

let calls: string[] = [];
let subscriptionRows: unknown[] = [];
let used: Record<string, number> = {};
let providerFails = false;

beforeEach(() => {
  calls = [];
  subscriptionRows = [];
  used = {};
  providerFails = false;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method ?? "GET";
    calls.push(`${method} ${u.replace(/^https:\/\/[^/]+/, "")}`);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    if (u.endsWith("/auth/v1/user")) return headers.Authorization === `Bearer ${GOOD}` ? Response.json({ id: "u1", email: "a@b.co", factors: [] }) : new Response("no", { status: 401 });
    if (u.includes("/rest/v1/subscriptions")) return Response.json(subscriptionRows);
    if (u.endsWith("/rest/v1/rpc/use_quota")) {
      const b = JSON.parse(String(init?.body));
      used[b.p_kind] ??= 0;
      if (b.p_limit <= 0 || used[b.p_kind] >= b.p_limit) return Response.json([{ allowed: false, used: used[b.p_kind] }]);
      used[b.p_kind]++;
      return Response.json([{ allowed: true, used: used[b.p_kind] }]);
    }
    if (u.includes("api.razorpay.com") || u.includes("api.stripe.com")) return providerFails ? new Response("{}", { status: 500 }) : Response.json({});
    if (u.includes("/auth/v1/admin/users/")) return new Response(null, { status: 200 });
    return new Response("unexpected", { status: 500 });
  }) as typeof fetch;
});

/** A same-site POST carrying the session cookie (token = null: signed out). */
const req = (path: string, token: string | null = GOOD, headers: Record<string, string> = {}) => {
  jar.clear();
  if (token) jar.set("__Host-startit-at", { value: token, opts: {} });
  return new Request(`https://app.test${path}`, { method: "POST", headers: { origin: "https://app.test", host: "app.test", ...headers }, body: "{}" });
};

/* ---------------------------------------------------------------- tests -- */

describe("webhook signatures", () => {
  const body = JSON.stringify({ type: "checkout.session.completed" });
  const t = Math.floor(Date.now() / 1000);
  const sign = (secret: string, ts: number) => createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");

  test("Stripe: valid signature accepted", () => expect(B.verifyStripe(body, `t=${t},v1=${sign("whsec_test", t)}`)).toBe(true));
  test("Stripe: tampered body rejected", () => expect(B.verifyStripe(body + " ", `t=${t},v1=${sign("whsec_test", t)}`)).toBe(false));
  test("Stripe: wrong secret rejected", () => expect(B.verifyStripe(body, `t=${t},v1=${sign("nope", t)}`)).toBe(false));
  test("Stripe: replayed (10-minute-old) signature rejected", () => expect(B.verifyStripe(body, `t=${t - 600},v1=${sign("whsec_test", t - 600)}`)).toBe(false));
  test("Razorpay: valid signature accepted, tampered rejected", () => {
    const sig = createHmac("sha256", "rzp_secret").update(body).digest("hex");
    expect(B.verifyRazorpay(body, sig)).toBe(true);
    expect(B.verifyRazorpay(body + "x", sig)).toBe(false);
  });
});

describe("webhooks map payments to the right plan", () => {
  test("a Stripe portal switch to the Scale price upgrades to Scale", () => {
    const row = W.fromStripeEvent(
      { type: "customer.subscription.updated", data: { object: { id: "sub", status: "active", metadata: { user_id: "u1", tier: "launch" }, items: { data: [{ price: { id: "price_S" }, current_period_end: 1800000000 }] } } } },
      B.tierFromStripePrice,
    );
    expect(row?.plan).toBe("scale");
  });
  test("a cancellation keeps the stored tier until the period ends", () => {
    const row = W.fromStripeEvent({ type: "customer.subscription.deleted", data: { object: { id: "sub", status: "canceled", items: { data: [{}] } } } }, B.tierFromStripePrice);
    expect(row?.status).toBe("canceled");
    expect(row && "plan" in row).toBe(false);
  });
  test("Razorpay activation on the Scale plan id → Scale", () => {
    const row = W.fromRazorpayEvent({ event: "subscription.activated", payload: { subscription: { entity: { id: "sub_R", plan_id: "plan_S", notes: { user_id: "u2" } } } } }, B.tierFromRazorpayPlan);
    expect(row).toMatchObject({ plan: "scale", status: "active", user_id: "u2" });
  });
});

describe("usage limits", () => {
  test("signed-out and forged requests are refused", async () => {
    expect(((await guard(req("/api/cofounder", null), "chat")) as Response).status).toBe(401);
    expect(((await guard(req("/api/cofounder", FORGED), "chat")) as Response).status).toBe(401);
  });

  test("a bearer token in a header is ignored: only the httpOnly cookie counts", async () => {
    expect(((await guard(req("/api/cofounder", null, { authorization: `Bearer ${GOOD}` }), "chat")) as Response).status).toBe(401);
  });

  test("cross-site requests are refused even with a valid session (CSRF)", async () => {
    expect(((await guard(req("/api/cofounder", GOOD, { origin: "https://evil.example" }), "chat")) as Response).status).toBe(401);
  });

  test("Garage gets exactly 10 AI messages a day, then an upgrade suggestion", async () => {
    let allowed = 0;
    let blocked: Response | null = null;
    for (let i = 0; i < 12 && !blocked; i++) {
      const g = await guard(req("/api/cofounder"), "chat");
      if (g instanceof Response) blocked = g;
      else allowed++;
    }
    expect(allowed).toBe(10);
    expect(blocked?.status).toBe(429);
    expect(await blocked!.json()).toMatchObject({ code: "limit_reached", plan: "garage", suggest: "launch" });
  });

  test("investor updates are locked until Scale", async () => {
    const g = (await guard(req("/api/cofounder"), "update")) as Response;
    expect((await g.json()).suggest).toBe("scale");
    subscriptionRows = [{ plan: "scale", status: "active", provider: "stripe", period_end: null }];
    expect(await guard(req("/api/cofounder"), "update")).not.toBeInstanceOf(Response);
  });
});

describe("account deletion", () => {
  test("cancels a paid plan first, then deletes the user", async () => {
    subscriptionRows = [{ provider: "razorpay", provider_sub: "sub_R", status: "active" }];
    const r = await deleteAccount(req("/api/account/delete"));
    expect(r.status).toBe(200);
    const cancel = calls.findIndex((c) => c.includes("subscriptions/sub_R/cancel"));
    const del = calls.findIndex((c) => c.includes("/auth/v1/admin/users/u1"));
    expect(cancel).toBeGreaterThanOrEqual(0);
    expect(del).toBeGreaterThan(cancel);
  });

  test("if billing can't be cancelled, nothing is deleted", async () => {
    subscriptionRows = [{ provider: "stripe", provider_sub: "sub_S", status: "active" }];
    providerFails = true;
    const r = await deleteAccount(req("/api/account/delete"));
    expect(r.status).toBe(502);
    expect(calls.some((c) => c.includes("/admin/users/"))).toBe(false);
  });
});

test("web checkout is refused from the store apps", async () => {
  const r = await checkout(req("/api/billing/checkout", GOOD, { "user-agent": "Mozilla/5.0 (iPhone) StartitApp" }));
  expect(r.status).toBe(403);
});
