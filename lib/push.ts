/**
 * Browser push notifications (Web Push). Free: no third-party service, just your server's
 * VAPID keys. Works on Android, desktop Chrome/Edge/Firefox/Safari, and on iPhone once the app
 * is added to the home screen (iOS 16.4+).
 */
import { cloudAccessToken, cloudEnabled } from "./cloud";
import { isNativeApp } from "./platform";

const VAPID = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY : undefined;

export type PushSupport = "ok" | "not-configured" | "unsupported" | "needs-install" | "preview" | "app";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  if ((window as unknown as { claude?: unknown }).claude) return "preview";
  // Inside the store apps, web push isn't available (phone apps need Apple/Google native push).
  if (isNativeApp()) return "app";
  if (!VAPID || !cloudEnabled()) return "not-configured";
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return ios && !standalone ? "needs-install" : "unsupported";
  return "ok";
}

function keyBytes(b64: string) {
  const s = (b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(s);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function authed(method: "POST" | "DELETE", body: unknown) {
  const token = await cloudAccessToken();
  if (!token) throw new Error("Sign in first.");
  const r = await fetch("/api/push/subscribe", { method, headers: { "content-type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error || `Failed (${r.status})`);
}

export async function enablePush(): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications are blocked. Allow them for this site in your browser settings.");
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID!) }));
  await authed("POST", { subscription: sub.toJSON() });
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await authed("DELETE", { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe();
  }
}

/** A test notification straight from the browser, to confirm it works on this device. */
export async function testPush() {
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  await reg?.showNotification("STARTIT", { body: "Push is on. Your co-founder can reach you now.", icon: "/icon-192.png", badge: "/icon-192.png", data: { url: "/" } });
}
