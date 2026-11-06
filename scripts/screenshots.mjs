// Takes the README screenshots from the running app.
//   1. npm run dev            (in one terminal)
//   2. npx playwright install chromium   (first time only)
//   3. npm run screenshots    → docs/screenshots/*.png
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = (process.env.BASE_URL || "http://localhost:3000") + "/app";
const OUT = fileURLToPath(new URL("../docs/screenshots/", import.meta.url));
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

async function session(viewport, colorScheme) {
  const page = await browser.newPage({ viewport, colorScheme, deviceScaleFactor: 2, timezoneId: "Asia/Kolkata", locale: "en-IN" });
  await page.goto(BASE);
  await page.fill("#ob-name", "Aarav Mehta");
  await page.fill("#ob-email", `demo-${Date.now()}@example.com`);
  await page.click("button:has-text('Continue')");
  await page.click("button:has-text('Continue with')");
  await page.click("[role=radio]:has-text('Explore a sample')");
  await page.click("text=Open the sample");
  await page.waitForTimeout(800);
  return page;
}

const shot = async (page, name) => {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}${name}.png` });
  console.log(`saved docs/screenshots/${name}.png`);
};
const tab = (page, label) => page.locator(`nav >> text=${label}`).first().click();

// Desktop, light
let page = await session({ width: 1440, height: 900 }, "light");
await tab(page, "Idea Audit");
await shot(page, "audit");
await tab(page, "Timetable");
await shot(page, "timetable");
await tab(page, "Customers");
await shot(page, "customers");
await tab(page, "Revenue");
await shot(page, "revenue");
await tab(page, "Accountability");
await shot(page, "accountability");
await page.click("[aria-label='Open settings']");
await page.click("button:has-text('Upgrade'), button:has-text('See plans')");
await shot(page, "plans");
await page.close();

// Desktop, dark
page = await session({ width: 1440, height: 900 }, "dark");
await tab(page, "Success Ledger");
await shot(page, "ledger-dark");
await page.close();

// Phone
page = await session({ width: 390, height: 844 }, "light");
await page.locator("button[aria-label$='notifications']").first().click();
await shot(page, "mobile");
await page.close();

await browser.close();
