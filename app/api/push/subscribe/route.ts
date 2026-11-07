/**
 * POST   /api/push/subscribe  { subscription }  — save this device for push notifications
 * DELETE /api/push/subscribe  { endpoint }      — remove it
 * Auth: the httpOnly session cookie (lib/server/session.ts); requests must come from this site.
 */
import { getCaller } from "@/lib/server/guard";

export const runtime = "nodejs";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** The signed-in founder's id from the httpOnly session (same-site requests only). */
async function userId(req: Request): Promise<string | null> {
  return (await getCaller(req))?.id ?? null;
}

const db = (path: string, init: RequestInit) =>
  fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { apikey: SERVICE!, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });

export async function POST(req: Request) {
  if (!SB || !SERVICE) return Response.json({ error: "Push isn't configured on the server." }, { status: 501 });
  const uid = await userId(req);
  if (!uid) return Response.json({ error: "Sign in again." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } } };
  const s = body.subscription;
  if (!s?.endpoint || !s.keys?.p256dh || !s.keys.auth) return Response.json({ error: "Invalid subscription." }, { status: 400 });
  const r = await db("push_subscriptions", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ endpoint: s.endpoint, user_id: uid, p256dh: s.keys.p256dh, auth: s.keys.auth }),
  });
  if (!r.ok) return Response.json({ error: `Could not save (${r.status})` }, { status: 502 });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  if (!SB || !SERVICE) return Response.json({ ok: true });
  const uid = await userId(req);
  if (!uid) return Response.json({ error: "Sign in again." }, { status: 401 });
  const { endpoint } = (await req.json().catch(() => ({}))) as { endpoint?: string };
  if (endpoint) await db(`push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}&user_id=eq.${uid}`, { method: "DELETE" });
  return Response.json({ ok: true });
}
