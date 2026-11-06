/**
 * Revenue: the founder's payment log is the single source of truth for money in STARTIT.
 * Entries come from manual logging, CSV exports (Stripe, Razorpay, banks), provider sync
 * in the Next.js app, or a weekly check-in that reported more than was logged.
 */
import { addDays, daysBetween, parse } from "./engine";
import type { RevenueEntry } from "./types";

export interface RevenueTotals {
  total: number;
  last30: number;
  mrr: number; // subscription revenue in the last 30 days, one charge per customer
  customers30: number;
  payments: number;
  otherCurrency: number; // entries not in the founder's currency (not summed)
  weekly: { start: string; amount: number }[]; // last 8 weeks, oldest first
}

export function revenueTotals(entries: RevenueEntry[], currency: string, now: string): RevenueTotals {
  const mine = entries.filter((e) => e.currency === currency);
  const from30 = addDays(now, -29);
  const recent = mine.filter((e) => e.date >= from30 && e.date <= now);
  const subs = new Map<string, number>();
  for (const e of recent.filter((e) => e.kind === "subscription").sort((a, b) => (a.date < b.date ? -1 : 1))) {
    subs.set(e.customer.trim().toLowerCase() || e.id, e.amount); // latest charge per customer
  }
  // Week buckets ending today
  const weekly = Array.from({ length: 8 }, (_, i) => {
    const start = addDays(now, -7 * (7 - i) - 6);
    const end = addDays(start, 6);
    return { start, amount: mine.filter((e) => e.date >= start && e.date <= end).reduce((s, e) => s + e.amount, 0) };
  });
  return {
    total: mine.reduce((s, e) => s + e.amount, 0),
    last30: recent.reduce((s, e) => s + e.amount, 0),
    mrr: [...subs.values()].reduce((s, v) => s + v, 0),
    customers30: new Set(recent.map((e) => e.customer.trim().toLowerCase()).filter(Boolean)).size,
    payments: mine.length,
    otherCurrency: entries.length - mine.length,
    weekly,
  };
}

/** Revenue logged in [from, to] inclusive, in one currency. */
export const revenueBetween = (entries: RevenueEntry[], currency: string, from: string, to: string) =>
  entries.filter((e) => e.currency === currency && e.date >= from && e.date <= to).reduce((s, e) => s + e.amount, 0);

/* ------------------------------------------------------------- CSV import -- */

export interface CsvResult {
  entries: RevenueEntry[];
  skipped: number;
  reasons: string[];
  provider: "Stripe" | "Razorpay" | "Bank / other";
}

function splitCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  const delim = (text.split("\n")[0].match(/;/g)?.length ?? 0) > (text.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

function parseAmount(raw: string): number | null {
  let s = raw.replace(/[^\d.,\-]/g, "");
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot && s.length - lastComma <= 3) s = s.replace(/\./g, "").replace(",", "."); // 1.234,56
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function parseDate(raw: string, dayFirst: boolean): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    let a = +m[1], b = +m[2];
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    let [d, mo] = dayFirst ? [a, b] : [b, a];
    if (mo > 12 && d <= 12) [d, mo] = [mo, d];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[a-z]*[\s-,]+(\d{4})/);
  if (m && MONTHS.includes(m[2].toLowerCase())) return `${m[3]}-${String(MONTHS.indexOf(m[2].toLowerCase()) + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

const find = (headers: string[], names: string[]) => {
  for (const n of names) {
    const i = headers.findIndex((h) => h === n);
    if (i >= 0) return i;
  }
  for (const n of names) {
    const i = headers.findIndex((h) => h.includes(n));
    if (i >= 0) return i;
  }
  return -1;
};

const BAD_STATUS = /fail|refund|cancel|void|declin|pending|dispute|uncaptured|created/i;

export function parseRevenueCsv(text: string, defaultCurrency: string, locale: string): CsvResult {
  const rows = splitCsv(text.replace(/^﻿/, ""));
  if (rows.length < 2) return { entries: [], skipped: 0, reasons: ["The file has no rows."], provider: "Bank / other" };
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const joined = headers.join("|");
  const provider: CsvResult["provider"] = /converted amount|customer email|seller message/.test(joined)
    ? "Stripe"
    : /order_id|method|vpa|razorpay|payment id/.test(joined)
      ? "Razorpay"
      : "Bank / other";

  const iAmount = find(headers, ["amount", "converted amount", "amount paid", "gross", "credit", "deposit", "deposits", "paid in"]);
  const iDate = find(headers, ["created date (utc)", "created (utc)", "created", "created_at", "date", "transaction date", "payment date", "value date"]);
  const iCurrency = find(headers, ["currency", "converted currency"]);
  const iCustomer = find(headers, ["customer email", "email", "customer name", "customer", "name", "contact", "description", "narration", "details"]);
  const iStatus = find(headers, ["status"]);
  const iId = find(headers, ["id", "payment id", "charge id", "transaction id", "reference"]);
  const iDesc = find(headers, ["description", "notes", "narration"]);
  const iInvoice = find(headers, ["invoice id", "invoice", "subscription"]);
  const iRefunded = find(headers, ["amount refunded", "refunded"]);

  if (iAmount < 0 || iDate < 0) {
    return { entries: [], skipped: rows.length - 1, reasons: ["Couldn't find an amount column and a date column in the header row."], provider };
  }

  const dayFirst = !/^en-US$/.test(locale);
  const entries: RevenueEntry[] = [];
  const reasons = new Set<string>();
  let skipped = 0;
  rows.slice(1).forEach((r, n) => {
    const status = iStatus >= 0 ? r[iStatus] ?? "" : "";
    if (status && BAD_STATUS.test(status)) {
      skipped++;
      reasons.add("failed, refunded or pending payments");
      return;
    }
    let amount = parseAmount(r[iAmount] ?? "");
    const refunded = iRefunded >= 0 ? parseAmount(r[iRefunded] ?? "") ?? 0 : 0;
    if (amount != null) amount -= refunded;
    const date = parseDate(r[iDate] ?? "", dayFirst);
    if (amount == null || amount <= 0 || !date) {
      skipped++;
      reasons.add(amount != null && amount <= 0 ? "zero or outgoing amounts" : "rows without a readable amount or date");
      return;
    }
    const desc = `${iDesc >= 0 ? r[iDesc] : ""} ${iInvoice >= 0 ? r[iInvoice] : ""}`.toLowerCase();
    entries.push({
      id: `csv-${n}-${Date.now().toString(36)}`,
      date,
      amount: Math.round(amount * 100) / 100,
      currency: (iCurrency >= 0 && r[iCurrency]?.trim() ? r[iCurrency].trim() : defaultCurrency).toUpperCase(),
      customer: (iCustomer >= 0 ? r[iCustomer] : "").trim().slice(0, 80) || "Unknown customer",
      kind: /subscri|invoice|in_|recurring|monthly/.test(desc) || (iInvoice >= 0 && (r[iInvoice] ?? "").trim()) ? "subscription" : "one-time",
      source: "csv",
      extId: iId >= 0 ? (r[iId] ?? "").trim() || undefined : undefined,
    });
  });
  return { entries, skipped, reasons: [...reasons], provider };
}

/** Drop entries whose provider id is already logged. */
export function dedupe(existing: RevenueEntry[], incoming: RevenueEntry[]) {
  const seen = new Set(existing.map((e) => e.extId).filter(Boolean));
  const fresh = incoming.filter((e) => !e.extId || !seen.has(e.extId));
  return { fresh, duplicates: incoming.length - fresh.length };
}

export const weekLabel = (start: string, now: string) => {
  const ago = Math.round(daysBetween(start, now) / 7);
  return ago === 0 ? "This wk" : `${ago}w ago`;
};

export { parse as parseIso };
