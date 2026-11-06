"use client";

import { FileUp, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { serverProbe } from "@/lib/research";
import { authHeaders } from "@/lib/cloud";
import { fmtDate, today } from "@/lib/engine";
import { currencySymbol, money } from "@/lib/locale";
import { dedupe, parseRevenueCsv, revenueTotals, weekLabel, type CsvResult } from "@/lib/revenue";
import { useStore } from "@/lib/store";
import type { RevenueEntry } from "@/lib/types";
import { Badge, Card, CardHeader, Modal, Stat, cx } from "../ui";

const SOURCE_LABEL: Record<RevenueEntry["source"], string> = {
  manual: "Logged",
  csv: "CSV",
  stripe: "Stripe",
  razorpay: "Razorpay",
  "check-in": "Check-in",
};



export function Revenue() {
  const { state, dispatch } = useStore();
  const now = today();
  const cur = state.prefs.currency;
  const t = useMemo(() => revenueTotals(state.revenue, cur, now), [state.revenue, cur, now]);
  const max = Math.max(1, ...t.weekly.map((w) => w.amount));

  const [form, setForm] = useState({ amount: "", date: now, customer: "", kind: "subscription" as RevenueEntry["kind"], note: "" });
  const [formErr, setFormErr] = useState<string | null>(null);
  const [csv, setCsv] = useState<(CsvResult & { duplicates: number; fileName: string }) | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Provider sync needs the STARTIT server; ask it rather than guessing. null = no server here.
  const [sync, setSync] = useState<{ stripe: boolean; razorpay: boolean; adminOnly: boolean } | null>(null);
  useEffect(() => {
    serverProbe<{ ok?: boolean; stripe?: boolean; razorpay?: boolean; adminOnly?: boolean }>("/api/revenue/sync").then((j) =>
      setSync(j?.ok ? { stripe: !!j.stripe, razorpay: !!j.razorpay, adminOnly: !!j.adminOnly } : null),
    );
  }, []);

  const add = () => {
    const amount = Number(form.amount.replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) return setFormErr("Enter an amount above zero.");
    if (!form.date || form.date > now) return setFormErr("Pick a date that isn't in the future.");
    setFormErr(null);
    dispatch({
      type: "REVENUE_ADD",
      entries: [{ id: `r${Date.now().toString(36)}`, date: form.date, amount, currency: cur, customer: form.customer.trim() || "Unnamed customer", kind: form.kind, source: "manual", note: form.note.trim() || undefined }],
    });
    setForm({ ...form, amount: "", customer: "", note: "" });
  };

  const onFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseRevenueCsv(text, cur, state.prefs.locale);
    const { fresh, duplicates } = dedupe(state.revenue, parsed.entries);
    setCsv({ ...parsed, entries: fresh, duplicates, fileName: file.name });
  };

  const runSync = async (provider: "stripe" | "razorpay") => {
    setSyncing(provider);
    try {
      const res = await fetch(`/api/revenue/sync?provider=${provider}`, { method: "POST", headers: await authHeaders() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      const { fresh } = dedupe(state.revenue, body.entries as RevenueEntry[]);
      dispatch({ type: "REVENUE_ADD", entries: fresh, note: fresh.length ? `${fresh.length} new payments synced.` : "Already up to date." });
      if (!fresh.length) dispatch({ type: "TOAST", tone: "ok", text: "Already up to date." });
    } catch (e) {
      dispatch({ type: "TOAST", tone: "warn", text: `Sync failed: ${(e as Error).message}` });
    } finally {
      setSyncing(null);
    }
  };

  const csvTotal = csv ? csv.entries.filter((e) => e.currency === cur).reduce((s, e) => s + e.amount, 0) : 0;
  const csvOther = csv ? csv.entries.filter((e) => e.currency !== cur).length : 0;

  return (
    <div className="space-y-5">
      {/* Summary */}
      <Card>
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4">
          <Stat label="Total revenue" value={money(t.total)} sub={`${t.payments} payment${t.payments === 1 ? "" : "s"}`} />
          <Stat label="Last 30 days" value={money(t.last30)} sub={`${t.customers30} paying customer${t.customers30 === 1 ? "" : "s"}`} />
          <Stat label="MRR" value={money(t.mrr)} sub="subscriptions, last 30 days" />
          <Stat label="Annual run rate" value={money(t.mrr * 12)} sub="MRR × 12" />
        </div>
        <div className="mt-6">
          <p className="mb-3 text-xs text-muted">Revenue per week</p>
          <div className="flex h-28 items-end gap-2" role="img" aria-label="Revenue per week for the last 8 weeks">
            {t.weekly.map((w) => (
              <div key={w.start} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <span className="tnum truncate text-[10px] text-muted">{w.amount ? money(w.amount) : ""}</span>
                <div className={cx("w-full rounded-t-sm", w.amount ? "bg-ink" : "bg-line")} style={{ height: `${w.amount ? Math.max(6, (w.amount / max) * 72) : 2}px` }} />
                <span className="truncate text-[10px] text-muted">{weekLabel(w.start, now)}</span>
              </div>
            ))}
          </div>
        </div>
        {t.otherCurrency > 0 && (
          <p className="mt-4 text-xs text-amber">
            {t.otherCurrency} payment{t.otherCurrency > 1 ? "s are" : " is"} in another currency and not included in these totals.
          </p>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="grid min-w-0 content-start gap-5">
          {/* Log a payment */}
          <Card>
            <CardHeader title="Log a payment" eyebrow="Only money that has actually landed" />
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                add();
              }}
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="rv-amount" className="mb-1.5 block text-xs font-medium text-muted">Amount ({currencySymbol()})</label>
                  <input id="rv-amount" inputMode="decimal" className="field tnum" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" />
                </div>
                <div>
                  <label htmlFor="rv-date" className="mb-1.5 block text-xs font-medium text-muted">Date received</label>
                  <input id="rv-date" type="date" max={now} className="field" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </div>
              </div>
              <div>
                <label htmlFor="rv-customer" className="mb-1.5 block text-xs font-medium text-muted">Customer</label>
                <input id="rv-customer" className="field" value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} placeholder="Who paid?" />
              </div>
              <div role="radiogroup" aria-label="Payment type" className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-abyss p-1">
                {(
                  [
                    ["subscription", "Subscription"],
                    ["one-time", "One-time"],
                  ] as const
                ).map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={form.kind === k}
                    onClick={() => setForm({ ...form, kind: k })}
                    className={cx("rounded-md py-1.5 text-sm transition", form.kind === k ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-ink")}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <div>
                <label htmlFor="rv-note" className="mb-1.5 block text-xs font-medium text-muted">Note (optional)</label>
                <input id="rv-note" className="field" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Annual plan, pilot, invoice #…" />
              </div>
              {formErr && <p className="text-sm text-flame">{formErr}</p>}
              <button type="submit" className="btn-primary w-full">
                <Plus className="h-4 w-4" /> Log payment
              </button>
            </form>
          </Card>

          {/* Import / connect */}
          <Card>
            <CardHeader title="Import from your payment provider" eyebrow="Pull in payments you already have" />
            <input
              ref={fileRef}
              id="rv-file"
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.target.value = "";
              }}
            />
            <button className="btn-ghost w-full" onClick={() => fileRef.current?.click()}>
              <FileUp className="h-4 w-4" /> Upload CSV export
            </button>
            <p className="mt-2.5 text-xs leading-relaxed text-muted">
              Works with Stripe (Payments → Export), Razorpay (Transactions → Payments → Download) and most bank statements. Failed and refunded payments are skipped,
              and payments you&apos;ve already imported won&apos;t be added twice.
            </p>
            {sync?.adminOnly ? null : sync ? (
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-4">
                {(["stripe", "razorpay"] as const).map((p) => (
                  <button key={p} className="btn-ghost text-xs" disabled={!!syncing || !sync[p]} title={sync[p] ? undefined : "Add the API key on the server first"} onClick={() => runSync(p)}>
                    <RefreshCw className={cx("h-3.5 w-3.5", syncing === p && "animate-spin")} /> Sync {p === "stripe" ? "Stripe" : "Razorpay"}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-4 border-t border-line pt-4 text-xs leading-relaxed text-muted">
                Live sync with Stripe and Razorpay is available in the full app, where your API key stays on the server.
              </p>
            )}
          </Card>
        </div>

        {/* Ledger */}
        <Card className="min-w-0">
          <CardHeader title="Payments" eyebrow={`${state.revenue.length} logged`} />
          {state.revenue.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line px-4 py-10 text-center">
              <p className="font-medium">No revenue yet</p>
              <p className="mx-auto mt-1 max-w-xs text-sm text-muted">Log your first payment or import a CSV. Your co-founder won&apos;t stop asking until you do.</p>
            </div>
          ) : (
            <ul className="-mx-2 divide-y divide-line">
              {state.revenue.map((e) => (
                <li key={e.id} className="group flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-abyss">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{e.customer}</p>
                    <p className="truncate text-xs text-muted">
                      {fmtDate(e.date)} · {e.kind === "subscription" ? "Subscription" : "One-time"} · {SOURCE_LABEL[e.source]}
                      {e.note ? ` · ${e.note}` : ""}
                    </p>
                  </div>
                  <span className={cx("tnum shrink-0 text-sm font-medium", e.currency !== cur && "text-muted")}>
                    {money(e.amount, { ...state.prefs, currency: e.currency })}
                  </span>
                  {confirmDel === e.id ? (
                    <span className="flex shrink-0 gap-1">
                      <button className="rounded-md px-2 py-1 text-xs font-medium text-flame hover:bg-flame/10" onClick={() => dispatch({ type: "REVENUE_DELETE", id: e.id })}>
                        Delete
                      </button>
                      <button className="rounded-md px-2 py-1 text-xs text-muted hover:text-ink" onClick={() => setConfirmDel(null)}>
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button
                      aria-label={`Delete payment from ${e.customer}`}
                      onClick={() => setConfirmDel(e.id)}
                      className="shrink-0 rounded-md p-1.5 text-muted opacity-60 transition hover:bg-surface hover:text-flame group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Modal open={!!csv} onClose={() => setCsv(null)} title="Import payments">
        {csv && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="truncate font-medium">{csv.fileName}</span>
              <Badge>{csv.provider}</Badge>
            </div>
            {csv.entries.length ? (
              <>
                <div className="rounded-lg border border-line p-4">
                  <p className="tnum text-2xl font-semibold tracking-tight">{money(csvTotal)}</p>
                  <p className="mt-0.5 text-sm text-muted">
                    from {csv.entries.length} payment{csv.entries.length > 1 ? "s" : ""}, {fmtDate(csv.entries.map((e) => e.date).sort()[0])} to{" "}
                    {fmtDate(csv.entries.map((e) => e.date).sort().slice(-1)[0])}
                  </p>
                </div>
                <ul className="max-h-48 divide-y divide-line overflow-y-auto rounded-lg border border-line text-sm">
                  {csv.entries.slice(0, 50).map((e) => (
                    <li key={e.id} className="flex justify-between gap-3 px-3 py-2">
                      <span className="min-w-0 truncate">
                        {e.customer} <span className="text-muted">· {fmtDate(e.date)}</span>
                      </span>
                      <span className="tnum shrink-0">{money(e.amount, { ...state.prefs, currency: e.currency })}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="rounded-lg border border-line p-4 text-sm">Nothing new to import.</p>
            )}
            <div className="space-y-1 text-xs text-muted">
              {csv.duplicates > 0 && <p>{csv.duplicates} already imported, skipped.</p>}
              {csv.skipped > 0 && (
                <p>
                  {csv.skipped} row{csv.skipped > 1 ? "s" : ""} skipped: {csv.reasons.join(", ")}.
                </p>
              )}
              {csvOther > 0 && <p className="text-amber">{csvOther} payment{csvOther > 1 ? "s are" : " is"} in another currency. They&apos;ll be listed but not added to your totals.</p>}
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setCsv(null)}>
                Cancel
              </button>
              <button
                className="btn-primary"
                disabled={!csv.entries.length}
                onClick={() => {
                  dispatch({ type: "REVENUE_ADD", entries: csv.entries });
                  setCsv(null);
                }}
              >
                Import {csv.entries.length} payment{csv.entries.length === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
