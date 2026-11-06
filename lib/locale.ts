/**
 * Location → currency, number and date formatting.
 *
 * The founder picks a country at onboarding (we only suggest one from the browser) and can
 * override the currency independently. Everything that shows money or dates reads from here.
 */

export interface Country {
  code: string; // ISO 3166-1 alpha-2
  name: string;
  currency: string; // ISO 4217
  locale: string; // BCP 47, drives number grouping and date order
}

export interface Prefs {
  country: string;
  currency: string;
  locale: string;
}

export const COUNTRIES: Country[] = [
  { code: "IN", name: "India", currency: "INR", locale: "en-IN" },
  { code: "US", name: "United States", currency: "USD", locale: "en-US" },
  { code: "GB", name: "United Kingdom", currency: "GBP", locale: "en-GB" },
  { code: "QA", name: "Qatar", currency: "QAR", locale: "en-QA" },
  { code: "AE", name: "United Arab Emirates", currency: "AED", locale: "en-AE" },
  { code: "SA", name: "Saudi Arabia", currency: "SAR", locale: "en-SA" },
  { code: "KW", name: "Kuwait", currency: "KWD", locale: "en-KW" },
  { code: "BH", name: "Bahrain", currency: "BHD", locale: "en-BH" },
  { code: "OM", name: "Oman", currency: "OMR", locale: "en-OM" },
  { code: "CA", name: "Canada", currency: "CAD", locale: "en-CA" },
  { code: "AU", name: "Australia", currency: "AUD", locale: "en-AU" },
  { code: "NZ", name: "New Zealand", currency: "NZD", locale: "en-NZ" },
  { code: "IE", name: "Ireland", currency: "EUR", locale: "en-IE" },
  { code: "DE", name: "Germany", currency: "EUR", locale: "de-DE" },
  { code: "FR", name: "France", currency: "EUR", locale: "fr-FR" },
  { code: "ES", name: "Spain", currency: "EUR", locale: "es-ES" },
  { code: "IT", name: "Italy", currency: "EUR", locale: "it-IT" },
  { code: "NL", name: "Netherlands", currency: "EUR", locale: "nl-NL" },
  { code: "SE", name: "Sweden", currency: "SEK", locale: "sv-SE" },
  { code: "CH", name: "Switzerland", currency: "CHF", locale: "de-CH" },
  { code: "PL", name: "Poland", currency: "PLN", locale: "pl-PL" },
  { code: "TR", name: "Türkiye", currency: "TRY", locale: "tr-TR" },
  { code: "IL", name: "Israel", currency: "ILS", locale: "en-IL" },
  { code: "EG", name: "Egypt", currency: "EGP", locale: "en-EG" },
  { code: "NG", name: "Nigeria", currency: "NGN", locale: "en-NG" },
  { code: "KE", name: "Kenya", currency: "KES", locale: "en-KE" },
  { code: "ZA", name: "South Africa", currency: "ZAR", locale: "en-ZA" },
  { code: "PK", name: "Pakistan", currency: "PKR", locale: "en-PK" },
  { code: "BD", name: "Bangladesh", currency: "BDT", locale: "en-BD" },
  { code: "LK", name: "Sri Lanka", currency: "LKR", locale: "en-LK" },
  { code: "NP", name: "Nepal", currency: "NPR", locale: "en-NP" },
  { code: "SG", name: "Singapore", currency: "SGD", locale: "en-SG" },
  { code: "MY", name: "Malaysia", currency: "MYR", locale: "en-MY" },
  { code: "ID", name: "Indonesia", currency: "IDR", locale: "id-ID" },
  { code: "PH", name: "Philippines", currency: "PHP", locale: "en-PH" },
  { code: "TH", name: "Thailand", currency: "THB", locale: "th-TH" },
  { code: "VN", name: "Vietnam", currency: "VND", locale: "vi-VN" },
  { code: "JP", name: "Japan", currency: "JPY", locale: "ja-JP" },
  { code: "KR", name: "South Korea", currency: "KRW", locale: "ko-KR" },
  { code: "CN", name: "China", currency: "CNY", locale: "zh-CN" },
  { code: "HK", name: "Hong Kong", currency: "HKD", locale: "en-HK" },
  { code: "BR", name: "Brazil", currency: "BRL", locale: "pt-BR" },
  { code: "MX", name: "Mexico", currency: "MXN", locale: "es-MX" },
  { code: "AR", name: "Argentina", currency: "ARS", locale: "es-AR" },
  { code: "CO", name: "Colombia", currency: "COP", locale: "es-CO" },
  { code: "CL", name: "Chile", currency: "CLP", locale: "es-CL" },
].sort((a, b) => a.name.localeCompare(b.name));

export const CURRENCIES = Array.from(new Set(COUNTRIES.map((c) => c.currency))).sort();

export const countryByCode = (code: string) => COUNTRIES.find((c) => c.code === code);

export function prefsFor(code: string, currency?: string): Prefs {
  const c = countryByCode(code) ?? COUNTRIES.find((x) => x.code === "US")!;
  return { country: c.code, currency: currency ?? c.currency, locale: c.locale };
}

/** Flag emoji from an ISO country code (regional indicator letters). */
export const flag = (code: string) => String.fromCodePoint(...[...code.toUpperCase()].map((ch) => 0x1f1a5 + ch.charCodeAt(0)));

const TZ_COUNTRY: Record<string, string> = {
  "Asia/Calcutta": "IN", "Asia/Kolkata": "IN", "Asia/Qatar": "QA", "Asia/Dubai": "AE", "Asia/Riyadh": "SA", "Asia/Kuwait": "KW",
  "Asia/Bahrain": "BH", "Asia/Muscat": "OM", "Europe/London": "GB", "Europe/Dublin": "IE", "Europe/Berlin": "DE", "Europe/Paris": "FR",
  "Europe/Madrid": "ES", "Europe/Rome": "IT", "Europe/Amsterdam": "NL", "Europe/Stockholm": "SE", "Europe/Zurich": "CH", "Europe/Warsaw": "PL",
  "Europe/Istanbul": "TR", "Asia/Jerusalem": "IL", "Africa/Cairo": "EG", "Africa/Lagos": "NG", "Africa/Nairobi": "KE", "Africa/Johannesburg": "ZA",
  "Asia/Karachi": "PK", "Asia/Dhaka": "BD", "Asia/Colombo": "LK", "Asia/Kathmandu": "NP", "Asia/Singapore": "SG", "Asia/Kuala_Lumpur": "MY",
  "Asia/Jakarta": "ID", "Asia/Manila": "PH", "Asia/Bangkok": "TH", "Asia/Ho_Chi_Minh": "VN", "Asia/Tokyo": "JP", "Asia/Seoul": "KR",
  "Asia/Shanghai": "CN", "Asia/Hong_Kong": "HK", "America/Sao_Paulo": "BR", "America/Mexico_City": "MX", "America/Argentina/Buenos_Aires": "AR",
  "America/Bogota": "CO", "America/Santiago": "CL", "America/Toronto": "CA", "America/Vancouver": "CA", "Australia/Sydney": "AU",
  "Australia/Melbourne": "AU", "Pacific/Auckland": "NZ",
};

/** A suggestion only; the founder confirms or changes it. */
export function detectCountry(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && TZ_COUNTRY[tz]) return TZ_COUNTRY[tz];
    if (tz?.startsWith("America/")) return "US";
    const region = (navigator.language || "").split("-")[1]?.toUpperCase();
    if (region && countryByCode(region)) return region;
  } catch {}
  return null;
}

/* --------------------------------------------------- active formatting -- */

let active: Prefs = prefsFor("IN");

/** Set by the store whenever the founder's preferences change. */
export function setActivePrefs(p: Prefs) {
  active = p;
}
export const activePrefs = () => active;

const nfCache = new Map<string, Intl.NumberFormat>();
function moneyFormat(p: Prefs, compact = false) {
  const key = `${p.locale}|${p.currency}|${compact}`;
  let nf = nfCache.get(key);
  if (!nf) {
    nf = new Intl.NumberFormat(p.locale, {
      style: "currency",
      currency: p.currency,
      maximumFractionDigits: ["KWD", "BHD", "OMR"].includes(p.currency) ? 3 : 0,
      ...(compact ? { notation: "compact" as const, maximumFractionDigits: 1 } : {}),
    });
    nfCache.set(key, nf);
  }
  return nf;
}

export const money = (n: number, p: Prefs = active) => moneyFormat(p).format(n);
export const moneyCompact = (n: number, p: Prefs = active) => moneyFormat(p, true).format(n);

export function currencySymbol(p: Prefs = active) {
  return moneyFormat(p).formatToParts(0).find((x) => x.type === "currency")?.value ?? p.currency;
}

export const num = (n: number, p: Prefs = active) => new Intl.NumberFormat(p.locale).format(n);

export function shortDate(iso: string, p: Prefs = active) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString(p.locale, { month: "short", day: "numeric", timeZone: "UTC" });
}

export function longDate(iso: string, p: Prefs = active) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString(p.locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** Rough monthly SaaS price for the sample startup, in the chosen currency (≈ US$18). */
const SAMPLE_PRICE: Record<string, number> = {
  INR: 1499, USD: 19, GBP: 15, EUR: 18, QAR: 69, AED: 69, SAR: 69, KWD: 6, BHD: 7, OMR: 7, CAD: 25, AUD: 29, NZD: 29, SEK: 199,
  CHF: 19, PLN: 79, TRY: 599, ILS: 69, EGP: 899, NGN: 14999, KES: 2499, ZAR: 349, PKR: 4999, BDT: 1999, LKR: 5499, NPR: 2499,
  SGD: 25, MYR: 79, IDR: 299000, PHP: 999, THB: 649, VND: 449000, JPY: 2800, KRW: 25000, CNY: 129, HKD: 149, BRL: 99, MXN: 349,
  ARS: 19999, COP: 79000, CLP: 17990,
};
export const samplePrice = (p: Prefs = active) => SAMPLE_PRICE[p.currency] ?? 19;
