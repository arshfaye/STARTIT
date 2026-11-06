import { describe, expect, test } from "bun:test";
import { money, prefsFor } from "@/lib/locale";
import { dedupe, parseRevenueCsv, revenueTotals } from "@/lib/revenue";
import type { RevenueEntry } from "@/lib/types";

describe("local currency formatting", () => {
  test("India uses lakh grouping", () => expect(money(125000, prefsFor("IN"))).toBe("₹1,25,000"));
  test("Germany puts the euro sign after the amount", () => expect(money(125000, prefsFor("DE")).replace(/\s/g, " ")).toBe("125.000 €"));
  test("currency can differ from the country", () => expect(money(49, prefsFor("QA", "USD"))).toContain("49"));
});

const STRIPE_CSV = `id,Created date (UTC),Amount,Amount Refunded,Currency,Status,Customer Email,Description,Invoice ID
ch_1,2026-10-28 10:12:00,69.00,0.00,qar,Paid,smile@clinic.qa,Subscription creation,in_1
ch_2,2026-10-30 09:00:00,"1,380.00",0.00,qar,Paid,big@clinic.qa,Annual plan,
ch_3,2026-10-31 11:00:00,69.00,0.00,qar,Failed,fail@clinic.qa,Subscription update,in_3
ch_4,2026-10-25 11:00:00,69.00,69.00,qar,Paid,refund@clinic.qa,Subscription update,in_4
ch_5,2026-10-26 11:00:00,19.00,5.00,usd,Paid,us@clinic.com,One-off,`;

describe("revenue CSV import", () => {
  const r = parseRevenueCsv(STRIPE_CSV, "QAR", "en-QA");

  test("detects a Stripe export", () => expect(r.provider).toBe("Stripe"));
  test("skips failed and fully refunded payments, nets partial refunds", () => {
    expect(r.entries.map((e) => e.extId)).toEqual(["ch_1", "ch_2", "ch_5"]);
    expect(r.entries.find((e) => e.extId === "ch_5")!.amount).toBe(14);
  });
  test("reads thousands separators and marks invoices as subscriptions", () => {
    expect(r.entries.find((e) => e.extId === "ch_2")!.amount).toBe(1380);
    expect(r.entries.find((e) => e.extId === "ch_1")!.kind).toBe("subscription");
  });
  test("never imports the same payment twice", () => {
    const { fresh, duplicates } = dedupe(r.entries, r.entries);
    expect(fresh).toHaveLength(0);
    expect(duplicates).toBe(3);
  });
  test("handles European bank exports (semicolons, 1.234,56)", () => {
    const bank = parseRevenueCsv('Date;Narration;Withdrawal;Deposit\n01/11/2026;NEFT FROM PEARL DENTAL;;"2.500,00"', "EUR", "de-DE");
    expect(bank.entries[0]).toMatchObject({ amount: 2500, date: "2026-11-01" });
  });
});

describe("revenue totals", () => {
  const e = (date: string, amount: number, customer: string, kind: RevenueEntry["kind"], currency = "INR"): RevenueEntry => ({ id: date + customer, date, amount, currency, customer, kind, source: "manual" });
  const t = revenueTotals(
    [e("2026-11-01", 1499, "Smile", "subscription"), e("2026-10-05", 1499, "Smile", "subscription"), e("2026-10-30", 5000, "Pearl", "one-time"), e("2026-10-30", 9, "US", "one-time", "USD")],
    "INR",
    "2026-11-02",
  );
  test("MRR counts each subscriber once, from the last 30 days", () => expect(t.mrr).toBe(1499));
  test("other currencies are reported, not summed", () => {
    expect(t.total).toBe(7998);
    expect(t.otherCurrency).toBe(1);
  });
});
