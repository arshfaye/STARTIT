// Writes the live site's address into the offline screen so "Try again" reloads the app.
// Run by `npm run app:sync`. Uses the same CAP_SERVER_URL as capacitor.config.ts.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const url = process.env.CAP_SERVER_URL;
if (!url || !/^https:\/\//.test(url)) {
  console.error("Set CAP_SERVER_URL to your live https:// address first, e.g. CAP_SERVER_URL=https://yourdomain.com npm run app:sync");
  process.exit(1);
}
const html = readFileSync(new URL("./offline.template.html", import.meta.url), "utf8").replaceAll("__SERVER_URL__", url);
mkdirSync(new URL("./www/", import.meta.url), { recursive: true });
writeFileSync(new URL("./www/offline.html", import.meta.url), html);
writeFileSync(new URL("./www/index.html", import.meta.url), html.replace("<h1>You're offline</h1>", "<h1>Loading STARTIT…</h1>"));
console.log(`App will load ${url}`);
