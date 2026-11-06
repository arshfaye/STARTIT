/**
 * The App Store / Play Store apps are a Capacitor shell around the live STARTIT site, so the
 * Next.js server (AI, research, billing, sync) keeps working exactly as on the web, and every
 * deploy updates the apps without a store release.
 *
 *   CAP_SERVER_URL=https://yourdomain.com npx cap sync   then   npx cap open android | ios
 */
import type { CapacitorConfig } from "@capacitor/cli";

const url = process.env.CAP_SERVER_URL || "https://startit.example.com";

const config: CapacitorConfig = {
  appId: process.env.CAP_APP_ID || "com.example.startit", // reverse domain you own, e.g. com.yourcompany.startit. Can't change after release.
  appName: "STARTIT",
  webDir: "native/www", // a tiny local fallback; the real app loads from `server.url`
  appendUserAgent: "StartitApp", // lets the app and server know they're inside the store app (lib/platform.ts)
  backgroundColor: "#181818",
  server: {
    url,
    cleartext: false,
    errorPath: "offline.html", // shown when the site can't be reached
  },
  ios: { contentInset: "never", limitsNavigationsToAppBoundDomains: false },
  android: { allowMixedContent: false },
};

export default config;
