/**
 * GET    /api/workspace  — the signed-in founder's encrypted workspace
 * PUT    /api/workspace  { data: Sealed, reminders }  — save it (ciphertext only)
 * DELETE /api/workspace  — delete it (lost recovery key)
 *
 * Runs on the founder's own access token, so the database's row-level security still applies.
 * The server refuses to store anything that isn't end-to-end encrypted.
 */
import { getCaller } from "@/lib/server/guard";
import { json, readBody } from "@/lib/server/http";
import { isSealed } from "@/lib/vault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Server-only: the browser never talks to Supabase, so the key isn't shipped to it.
const ANON = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const asUser = (token: string, path: string, init: RequestInit = {}) =>
  fetch(`${SB}/rest/v1/${path}`, { ...init, cache: "no-store", headers: { apikey: ANON!, Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });

/** Reminder facts are dates and counts only; anything else is dropped. */
function cleanFacts(f: unknown) {
  if (!f || typeof f !== "object") return null;
  const x = f as Record<string, unknown>;
  const dates = (v: unknown) => (Array.isArray(v) ? v.filter((d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d)).slice(0, 500) : []);
  const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 30) : null);
  return { v: 1, openDue: dates(x.openDue), lastActive: date(x.lastActive) ?? "", lastCheckIn: date(x.lastCheckIn), decisionBy: date(x.decisionBy), liveLeads: dates(x.liveLeads), email: x.email !== false };
}

async function caller(req: Request) {
  const c = await getCaller(req);
  return c && !c.dev ? c : null;
}

export async function GET(req: Request) {
  const c = await caller(req);
  if (!c) return json({ error: "Sign in first.", code: "unauthorized" }, 401);
  const r = await asUser(c.accessToken, `workspaces?user_id=eq.${c.id}&select=data`);
  if (!r.ok) return json({ error: "Couldn't load your workspace.", code: "upstream_error" }, 502);
  const row = ((await r.json()) as { data: unknown }[])[0];
  return json({ data: row?.data ?? null });
}

export async function PUT(req: Request) {
  const c = await caller(req);
  if (!c) return json({ error: "Sign in first.", code: "unauthorized" }, 401);
  const body = await readBody<{ data?: unknown; reminders?: unknown }>(req, 4_000_000);
  if (!body) return json({ error: "Workspace too large or invalid.", code: "bad_request" }, 413);
  if (!isSealed(body.data)) return json({ error: "Only encrypted workspaces can be saved.", code: "not_encrypted" }, 400);
  const r = await asUser(c.accessToken, "workspaces", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ user_id: c.id, email: c.email, data: body.data, reminders: cleanFacts(body.reminders), updated_at: new Date().toISOString() }),
  });
  if (!r.ok) return json({ error: `Couldn't save (${r.status}).`, code: "upstream_error" }, 502);
  return json({ ok: true });
}

export async function DELETE(req: Request) {
  const c = await caller(req);
  if (!c) return json({ error: "Sign in first.", code: "unauthorized" }, 401);
  const r = await asUser(c.accessToken, `workspaces?user_id=eq.${c.id}`, { method: "DELETE" });
  if (!r.ok) return json({ error: "Couldn't delete the workspace.", code: "upstream_error" }, 502);
  return json({ ok: true });
}
