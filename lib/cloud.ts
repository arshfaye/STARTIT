/**
 * Real accounts and cloud storage (optional).
 *
 * Turned on when NEXT_PUBLIC_SUPABASE_URL is set (the keys themselves stay on the server). Without it
 * the app keeps working on browser storage (and in the Claude artifact preview).
 *
 * The browser never sees an auth token. Sign-in, two-step verification and storage all go
 * through STARTIT's own /api routes, which keep the session in httpOnly, Secure, SameSite=Strict
 * cookies (lib/server/session.ts). Same-origin fetches send those cookies automatically.
 * Workspaces are end-to-end encrypted on the device before they're saved (lib/vault.ts).
 */
import { reminderFacts } from "./nudges";
import type { AppState } from "./types";
import { createKey, forgetDeviceKey, isSealed, keyFromRecovery, loadDeviceKey, open, saveDeviceKey, seal } from "./vault";

// Written out in full so Next.js inlines them at build time.
const URL_ = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_SUPABASE_URL : undefined;

export const cloudEnabled = () => !!URL_;

/** Older versions kept Supabase tokens in localStorage. Remove any that are still there. */
export function purgeLegacyTokens() {
  try {
    for (const k of Object.keys(localStorage)) if (/^sb-.*-auth-token/.test(k) || k === "supabase.auth.token") localStorage.removeItem(k);
  } catch {}
}

export class AuthError extends Error {
  constructor(
    message: string,
    public code: string,
    public extra: { siteKey?: string; retryAfter?: number } = {},
  ) {
    super(message);
  }
}

async function api<T>(path: string, method: "GET" | "POST" | "PUT" | "DELETE" = "POST", body?: unknown): Promise<T> {
  const r = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const b = (await r.json().catch(() => ({}))) as T & { error?: string; code?: string; siteKey?: string; retryAfter?: number };
  if (!r.ok) throw new AuthError(b.error ?? `Request failed (${r.status})`, b.code ?? "error", { siteKey: b.siteKey, retryAfter: b.retryAfter });
  return b;
}

/* --------------------------------------------------------------- session -- */

export interface SessionInfo {
  configured: boolean;
  signedIn: boolean;
  id?: string;
  email?: string;
  captchaSiteKey?: string | null;
  mfa?: { enabled: boolean; needed: boolean; backupCodesLeft: number | null; requiredForAdmin: boolean };
}

export async function getSession(): Promise<SessionInfo> {
  if (!cloudEnabled()) return { configured: false, signedIn: false };
  return api<SessionInfo>("/api/auth/session", "GET");
}

export async function cloudUserEmail(): Promise<string | null> {
  const s = await getSession().catch(() => null);
  return s?.signedIn && !s.mfa?.needed ? (s.email ?? null) : null;
}

export async function sendMagicLink(email: string, captcha?: string) {
  await api("/api/auth/otp", "POST", { email, captcha });
}

/** Sign in with the 6-digit code from the email. Returns whether the authenticator app is needed next. */
export async function verifyEmailCode(email: string, code: string, captcha?: string): Promise<{ mfaRequired: boolean }> {
  return api("/api/auth/verify", "POST", { email, code, captcha });
}

export const mfa = {
  enroll: () => api<{ factorId: string; qr: string; secret: string; uri: string }>("/api/auth/mfa/enroll", "POST", {}),
  verify: (code: string, factorId?: string, captcha?: string) => api<{ ok: true; enrolled?: boolean; backupCodes?: string[] }>("/api/auth/mfa/verify", "POST", { code, factorId, captcha }),
  backup: (code: string, captcha?: string) => api<{ ok: true; reenroll: boolean }>("/api/auth/mfa/backup", "POST", { code, captcha }),
  disable: (code: string, captcha?: string) => api<{ ok: true }>("/api/auth/mfa/disable", "POST", { code, captcha }),
  newCodes: () => api<{ backupCodes: string[] }>("/api/auth/mfa/codes", "POST", {}),
};

/** Permanently delete the signed-in account on the server (data, billing, devices). */
export async function deleteCloudAccount() {
  await api("/api/account/delete", "POST", {});
  await forgetVault();
}

export async function cloudSignOut() {
  if (!cloudEnabled()) return;
  await forgetVault();
  await api("/api/auth/logout", "POST", {}).catch(() => {});
}

/** Sessions live in httpOnly cookies that same-origin requests send by themselves, so there's nothing to add. */
export async function authHeaders(): Promise<Record<string, string>> {
  return {};
}

/** Tell the app a plan limit was hit; the shell opens the upgrade screen. */
export function announceLimit(detail: { kind?: string; limit?: number; plan?: string; message?: string; suggest?: string | null }) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("startit:limit", { detail }));
}

/* ------------------------------------------------- encrypted workspace -- */
// The workspace is sealed on this device (lib/vault.ts) before it reaches the server.
// The server stores ciphertext plus a few content-free reminder facts (dates and counts).

let vaultKey: CryptoKey | null = null;
let vaultOwner: string | null = null;

export type VaultOpen =
  /** Unlocked. `recovery` is set when a new key was just made: show it to the founder once. */
  | { kind: "ready"; state: AppState | null; recovery?: string }
  /** The workspace is encrypted and this device doesn't have the key yet. */
  | { kind: "locked" };

async function currentUserId(): Promise<string | null> {
  const s = await getSession();
  return s.signedIn && !s.mfa?.needed ? (s.id ?? null) : null;
}

async function readRow(): Promise<unknown> {
  return (await api<{ data: unknown }>("/api/workspace", "GET")).data ?? null;
}

async function newKey(userId: string) {
  const { key, recovery } = await createKey();
  await saveDeviceKey(userId, key);
  vaultKey = key;
  vaultOwner = userId;
  return recovery;
}

export async function openCloudWorkspace(): Promise<VaultOpen> {
  const id = await currentUserId();
  if (!id) return { kind: "ready", state: null };
  const row = await readRow();
  const key = await loadDeviceKey(id);

  if (isSealed(row)) {
    if (!key) return { kind: "locked" };
    try {
      const state = await open<AppState>(key, row, id);
      vaultKey = key;
      vaultOwner = id;
      return { kind: "ready", state };
    } catch {
      return { kind: "locked" };
    }
  }
  // New account, or a workspace saved before encryption: it gets sealed on the next save.
  if (key) {
    vaultKey = key;
    vaultOwner = id;
    return { kind: "ready", state: (row as AppState | null) ?? null };
  }
  return { kind: "ready", state: (row as AppState | null) ?? null, recovery: await newKey(id) };
}

/** Unlock on a new device with the recovery key. Throws if the key is wrong. */
export async function unlockCloudWorkspace(code: string): Promise<AppState | null> {
  const id = await currentUserId();
  if (!id) throw new Error("You're signed out. Sign in again.");
  const key = await keyFromRecovery(code);
  const row = await readRow();
  const state = isSealed(row) ? await open<AppState>(key, row, id) : ((row as AppState | null) ?? null);
  await saveDeviceKey(id, key);
  vaultKey = key;
  vaultOwner = id;
  return state;
}

/** Lost the recovery key: wipe the unreadable workspace and start again with a new key. */
export async function resetCloudWorkspace(): Promise<string> {
  const id = await currentUserId();
  if (!id) throw new Error("You're signed out. Sign in again.");
  await api("/api/workspace", "DELETE");
  return newKey(id);
}

/** Make a new recovery key (the old one stops working) and re-encrypt the workspace with it. */
export async function rotateRecoveryKey(state: AppState): Promise<string> {
  const id = await currentUserId();
  if (!id) throw new Error("You're signed out. Sign in again.");
  const prev = { key: vaultKey, owner: vaultOwner };
  const { key, recovery } = await createKey();
  vaultKey = key;
  vaultOwner = id;
  try {
    // Only keep the new key on this device once the server holds a copy encrypted with it.
    await saveCloudWorkspace(state, true);
  } catch (e) {
    vaultKey = prev.key;
    vaultOwner = prev.owner;
    throw e;
  }
  await saveDeviceKey(id, key);
  return recovery;
}

export async function saveCloudWorkspace(state: AppState, strict = false) {
  // Never write plaintext: without this device's key there is nothing safe to save.
  if (!vaultKey || !vaultOwner) {
    if (strict) throw new Error("This device can't encrypt your workspace yet.");
    return;
  }
  const { toast, pendingPrompt, ...rest } = state;
  try {
    const sealed = await seal(vaultKey, { ...rest, chat: rest.chat.slice(-40), toast: null, pendingPrompt: null }, vaultOwner);
    await api("/api/workspace", "PUT", { data: sealed, reminders: reminderFacts(state) });
  } catch (e) {
    if (strict) throw e;
    console.warn("Cloud save failed:", (e as Error).message);
  }
}

/** Forget this device's key (on sign-out or account deletion). */
export async function forgetVault() {
  if (vaultOwner) await forgetDeviceKey(vaultOwner);
  vaultKey = null;
  vaultOwner = null;
}
