/**
 * Real accounts and cloud storage via Supabase (optional).
 *
 * Turned on when NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set.
 * Without them the app keeps working on browser storage (and in the Claude artifact preview).
 * Sign-in is passwordless: Supabase emails a magic link. Schema: supabase/schema.sql.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppState } from "./types";

// Written out in full so Next.js inlines them at build time.
const URL = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_SUPABASE_URL : undefined;
const KEY = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY : undefined;

export const cloudEnabled = () => !!URL && !!KEY;

let client: Promise<SupabaseClient> | null = null;
function supa() {
  if (!cloudEnabled()) throw new Error("Cloud is not configured");
  client ??= import("@supabase/supabase-js").then((m) => m.createClient(URL!, KEY!, { auth: { persistSession: true, detectSessionInUrl: true } }));
  return client;
}

export async function sendMagicLink(email: string) {
  const s = await supa();
  const { error } = await s.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
  if (error) throw new Error(error.message);
}

/**
 * Sign in with the 6-digit code from the same email. Inside the phone app the link would open the
 * browser instead of the app, so the code is how app users get in.
 * Needs {{ .Token }} in Supabase's "Magic Link" email template (see README).
 */
export async function verifyEmailCode(email: string, code: string) {
  const s = await supa();
  const { error } = await s.auth.verifyOtp({ email, token: code, type: "email" });
  if (error) throw new Error(error.message.includes("expired") || error.message.includes("invalid") ? "That code is wrong or has expired. Request a new one." : error.message);
}

/** Permanently delete the signed-in account on the server (data, billing, devices). */
export async function deleteCloudAccount() {
  const r = await fetch("/api/account/delete", { method: "POST", headers: await authHeaders() });
  const b = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) throw new Error(b.error ?? `Couldn't delete the account (${r.status}).`);
  await cloudSignOut().catch(() => {});
}

export async function cloudUserEmail(): Promise<string | null> {
  if (!cloudEnabled()) return null;
  const s = await supa();
  const { data } = await s.auth.getSession();
  return data.session?.user.email ?? null;
}

export async function loadCloudWorkspace(): Promise<AppState | null> {
  const s = await supa();
  const { data: auth } = await s.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await s.from("workspaces").select("data").eq("user_id", auth.user.id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.data as AppState) ?? null;
}

export async function saveCloudWorkspace(state: AppState) {
  const s = await supa();
  const { data: auth } = await s.auth.getUser();
  if (!auth.user) return;
  const { toast, pendingPrompt, ...rest } = state;
  const { error } = await s.from("workspaces").upsert({
    user_id: auth.user.id,
    email: auth.user.email,
    data: { ...rest, chat: rest.chat.slice(-40), toast: null, pendingPrompt: null },
    updated_at: new Date().toISOString(),
  });
  if (error) console.warn("Cloud save failed:", error.message);
}

export async function cloudAccessToken(): Promise<string | null> {
  if (!cloudEnabled()) return null;
  const s = await supa();
  const { data } = await s.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Authorization header for STARTIT's own API routes (empty when there's no cloud session). */
export async function authHeaders(): Promise<Record<string, string>> {
  const token = await cloudAccessToken().catch(() => null);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Tell the app a plan limit was hit; the shell opens the upgrade screen. */
export function announceLimit(detail: { kind?: string; limit?: number; plan?: string; message?: string; suggest?: string | null }) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("startit:limit", { detail }));
}

export async function cloudSignOut() {
  if (!cloudEnabled()) return;
  const s = await supa();
  await s.auth.signOut();
}
