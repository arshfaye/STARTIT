/**
 * Where STARTIT is running. The App Store and Play Store builds are the same web app inside a
 * Capacitor shell (capacitor.config.ts), which injects `window.Capacitor` and appends
 * "StartitApp" to the user agent. Store rules on payments differ from the web, so a few screens
 * check this.
 */
export const APP_UA_MARKER = "StartitApp";

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (cap?.isNativePlatform?.()) return true;
  return typeof navigator !== "undefined" && navigator.userAgent.includes(APP_UA_MARKER);
}

/** Server side: was this request made from the store app? */
export const isNativeRequest = (req: Request) => (req.headers.get("user-agent") ?? "").includes(APP_UA_MARKER);
