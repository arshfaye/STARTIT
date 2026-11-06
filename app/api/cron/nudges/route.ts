/**
 * GET /api/cron/nudges — run once a day (see vercel.json).
 * Reads every workspace on a paid plan (Launch and Scale; Scale also gets the morning brief),
 * works out which reminders are due (lib/nudges.ts) and sends them as
 * push notifications to the founder's devices (free, Web Push) and, optionally, by email (Resend).
 * Each reminder goes out at most once a day per channel.
 *
 * Env:
 *   CRON_SECRET                         Vercel sends it as "Authorization: Bearer <secret>"
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:you@domain.com)
 *     Generate the key pair once with:  npx web-push generate-vapid-keys
 *   RESEND_API_KEY, REMINDER_FROM       optional email channel; also used for the partner's weekly report
 */
import webpush from "web-push";
import { nudgesFor, type Nudge } from "@/lib/nudges";
import { atLeast, effectivePlan, type PlanId } from "@/lib/plans";
import type { AppState } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const db = (path: string, init: RequestInit = {}) =>
  fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { apikey: SERVICE!, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });

const pushReady = !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
if (pushReady) webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);

/** Insert-or-skip: the primary key makes a second send on the same day impossible. */
async function claim(userId: string, kind: string, day: string, channel: string) {
  const r = await db("notification_log", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify({ user_id: userId, kind, day, channel }),
  });
  return r.ok && ((await r.json()) as unknown[]).length > 0;
}

async function email(to: string, n: Nudge) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.REMINDER_FROM;
  if (!key || !from) return "email not configured";
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject: n.subject, text: n.body }),
  });
  return r.ok ? "email sent" : `email failed ${r.status}`;
}

type Sub = { endpoint: string; p256dh: string; auth: string };

async function push(subs: Sub[], n: Nudge) {
  if (!pushReady) return "push not configured";
  const payload = JSON.stringify({ title: n.subject, body: n.body.replace(/\s*\n+\s*/g, " ").slice(0, 240), url: `/#${n.tab}`, tag: n.kind });
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 12 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      // The device unsubscribed or the browser dropped it: forget it.
      if (code === 404 || code === 410) await db(`push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: "DELETE" });
    }
  }
  return sent ? "push sent" : "push failed";
}

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!SB || !SERVICE) return Response.json({ error: "Supabase is not configured" }, { status: 501 });

  const [ws, ps, ss] = await Promise.all([
    db("workspaces?select=user_id,email,data"),
    db("push_subscriptions?select=user_id,endpoint,p256dh,auth"),
    db("subscriptions?select=user_id,plan,status,provider,period_end"),
  ]);
  if (!ws.ok) return Response.json({ error: `Could not read workspaces (${ws.status})` }, { status: 502 });
  const rows = (await ws.json()) as { user_id: string; email: string; data: AppState }[];
  const subsByUser = new Map<string, Sub[]>();
  if (ps.ok) for (const s of (await ps.json()) as (Sub & { user_id: string })[]) subsByUser.set(s.user_id, [...(subsByUser.get(s.user_id) ?? []), s]);

  const planOf = new Map<string, PlanId>();
  if (ss.ok)
    for (const r of (await ss.json()) as { user_id: string; plan: PlanId; status: string; provider: "stripe" | "razorpay"; period_end: string | null }[])
      planOf.set(r.user_id, effectivePlan({ plan: r.plan, status: r.status, provider: r.provider, periodEnd: r.period_end }));

  const day = new Date().toISOString().slice(0, 10);
  const results: Record<string, number> = {};
  const count = (k: string) => (results[k] = (results[k] ?? 0) + 1);

  for (const row of rows) {
    const s = row.data;
    const plan = planOf.get(row.user_id) ?? "garage";
    // Push, email reminders and partner reports are Launch features; Garage gets the in-app bell.
    if (!atLeast(plan, "launch")) continue;
    const subs = subsByUser.get(row.user_id) ?? [];
    for (const n of nudgesFor(s, day, plan)) {
      if (n.to === "partner") {
        if (await claim(row.user_id, n.kind, day, "email")) count(await email(s.notify.partnerEmail, n));
        continue;
      }
      if (subs.length && (await claim(row.user_id, n.kind, day, "push"))) count(await push(subs, n));
      if (s.notify?.email !== false && (await claim(row.user_id, n.kind, day, "email"))) count(await email(row.email, n));
    }
  }
  return Response.json({ workspaces: rows.length, results });
}
