/**
 * Real accounts and cloud storage via Supabase (optional).
 *
 * Turned on when NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set.
 * Without them the app keeps working on browser storage (and in the Claude artifact preview).
 * Sign-in is passwordless: Supabase emails a magic link. Schema: supabase/schema.sql.
 * Workspaces are end-to-end encrypted on the device before they're saved (lib/vault.ts).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { reminderFacts } from "./nudges";
import type { AppState } from "./types";
import { createKey, forgetDeviceKey, isSealed, keyFromRecovery, loadDeviceKey, open, saveDeviceKey, seal } from "./vault";

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

/* ------------------------------------------------- encrypted workspace -- */
// The workspace is sealed on this device (lib/vault.ts) before it reaches the database.
// The server stores ciphertext plus a few content-free reminder facts (dates and counts).

let vaultKey: CryptoKey | null = null;
let vaultOwner: string | null = null;

export type VaultOpen =
  /** Unlocked. `recovery` is set when a new key was just made: show it to the founder once. */
  | { kind: "ready"; state: AppState | null; recovery?: string }
  /** The workspace is encrypted and this device doesn't have the key yet. */
  | { kind: "locked" };

async function currentUser() {
  const s = await supa();
  const { data } = await s.auth.getUser();
  return data.user;
}

async function readRow(userId: string): Promise<unknown> {
  const s = await supa();
  const { data, error } = await s.from("workspaces").select("data").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.data ?? null;
}

async function newKey(userId: string) {
  const { key, recovery } = await createKey();
  await saveDeviceKey(userId, key);
  vaultKey = key;
  vaultOwner = userId;
  return recovery;
}

export async function openCloudWorkspace(): Promise<VaultOpen> {
  const user = await currentUser();
  if (!user) return { kind: "ready", state: null };
  const row = await readRow(user.id);
  const key = await loadDeviceKey(user.id);

  if (isSealed(row)) {
    if (!key) return { kind: "locked" };
    try {
      const state = await open<AppState>(key, row, user.id);
      vaultKey = key;
      vaultOwner = user.id;
      return { kind: "ready", state };
    } catch {
      return { kind: "locked" };
    }
  }
  // New account, or a workspace saved before encryption: it gets sealed on the next save.
  if (key) {
    vaultKey = key;
    vaultOwner = user.id;
    return { kind: "ready", state: (row as AppState | null) ?? null };
  }
  return { kind: "ready", state: (row as AppState | null) ?? null, recovery: await newKey(user.id) };
}

/** Unlock on a new device with the recovery key. Throws if the key is wrong. */
export async function unlockCloudWorkspace(code: string): Promise<AppState | null> {
  const user = await currentUser();
  if (!user) throw new Error("You're signed out. Sign in again.");
  const key = await keyFromRecovery(code);
  const row = await readRow(user.id);
  const state = isSealed(row) ? await open<AppState>(key, row, user.id) : ((row as AppState | null) ?? null);
  await saveDeviceKey(user.id, key);
  vaultKey = key;
  vaultOwner = user.id;
  return state;
}

/** Lost the recovery key: wipe the unreadable workspace and start again with a new key. */
export async function resetCloudWorkspace(): Promise<string> {
  const user = await currentUser();
  if (!user) throw new Error("You're signed out. Sign in again.");
  const s = await supa();
  const { error } = await s.from("workspaces").delete().eq("user_id", user.id);
  if (error) throw new Error(error.message);
  return newKey(user.id);
}

/** Make a new recovery key (the old one stops working) and re-encrypt the workspace with it. */
export async function rotateRecoveryKey(state: AppState): Promise<string> {
  const user = await currentUser();
  if (!user) throw new Error("You're signed out. Sign in again.");
  const prev = { key: vaultKey, owner: vaultOwner };
  const { key, recovery } = await createKey();
  vaultKey = key;
  vaultOwner = user.id;
  try {
    // Only keep the new key on this device once the server holds a copy encrypted with it.
    await saveCloudWorkspace(state, true);
  } catch (e) {
    vaultKey = prev.key;
    vaultOwner = prev.owner;
    throw e;
  }
  await saveDeviceKey(user.id, key);
  return recovery;
}

export async function saveCloudWorkspace(state: AppState, strict = false) {
  const user = await currentUser();
  if (!user) return;
  // Never write plaintext: without this device's key there is nothing safe to save.
  if (!vaultKey || vaultOwner !== user.id) {
    if (strict) throw new Error("This device can't encrypt your workspace yet.");
    return;
  }
  const { toast, pendingPrompt, ...rest } = state;
  const sealed = await seal(vaultKey, { ...rest, chat: rest.chat.slice(-40), toast: null, pendingPrompt: null }, user.id);
  const s = await supa();
  const { error } = await s.from("workspaces").upsert({
    user_id: user.id,
    email: user.email,
    data: sealed,
    reminders: reminderFacts(state),
    updated_at: new Date().toISOString(),
  });
  if (error) {
    if (strict) throw new Error(error.message);
    console.warn("Cloud save failed:", error.message);
  }
}

/** Forget this device's key (on sign-out or account deletion). */
export async function forgetVault() {
  if (vaultOwner) await forgetDeviceKey(vaultOwner);
  vaultKey = null;
  vaultOwner = null;
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
  await forgetVault();
  const s = await supa();
  await s.auth.signOut();
}
