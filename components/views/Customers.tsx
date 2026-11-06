"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { daysBetween, fmtDate, today } from "@/lib/engine";
import { money } from "@/lib/locale";
import { useStore } from "@/lib/store";
import type { Interview, Lead, LeadStage } from "@/lib/types";
import { Badge, Card, CardHeader, Modal, Stat, cx } from "../ui";

export const STAGES: { id: LeadStage; label: string }[] = [
  { id: "lead", label: "Lead" },
  { id: "contacted", label: "Contacted" },
  { id: "replied", label: "Replied" },
  { id: "demo", label: "Demo" },
  { id: "paid", label: "Paid" },
  { id: "lost", label: "Lost" },
];
const ORDER: LeadStage[] = ["lead", "contacted", "replied", "demo", "paid"];
const reached = (l: Lead, s: LeadStage) => l.stage !== "lost" && ORDER.indexOf(l.stage) >= ORDER.indexOf(s);

export function Customers() {
  const [view, setView] = useState<"pipeline" | "interviews">("pipeline");
  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Customers" className="inline-grid grid-cols-2 gap-1 rounded-lg border border-line bg-abyss p-1">
        {(
          [
            ["pipeline", "Sales pipeline"],
            ["interviews", "Interviews"],
          ] as const
        ).map(([v, l]) => (
          <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={cx("rounded-md px-4 py-1.5 text-sm transition", view === v ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-ink")}>
            {l}
          </button>
        ))}
      </div>
      {view === "pipeline" ? <Pipeline /> : <Interviews />}
    </div>
  );
}

/* ------------------------------------------------------------- pipeline -- */

function Pipeline() {
  const { state, dispatch } = useStore();
  const now = today();
  const [adding, setAdding] = useState(false);
  const [paidLead, setPaidLead] = useState<Lead | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const leads = state.leads;

  const funnel = ORDER.map((s) => ({ s, n: leads.filter((l) => reached(l, s)).length }));
  const stale = leads.filter((l) => !["paid", "lost"].includes(l.stage) && daysBetween(l.updatedAt, now) >= 7);
  const pipelineValue = leads.filter((l) => ["replied", "demo"].includes(l.stage)).reduce((s, l) => s + l.value, 0);
  const worst = funnel.slice(1).reduce<{ from: string; to: string; rate: number } | null>((w, f, i) => {
    const prev = funnel[i].n;
    if (prev < 3) return w;
    const rate = f.n / prev;
    return !w || rate < w.rate ? { from: STAGES.find((x) => x.id === funnel[i].s)!.label, to: STAGES.find((x) => x.id === f.s)!.label, rate } : w;
  }, null);

  const setStage = (l: Lead, stage: LeadStage) => {
    dispatch({ type: "LEAD_UPDATE", id: l.id, patch: { stage } });
    if (stage === "paid") setPaidLead({ ...l, stage });
  };

  return (
    <>
      <Card>
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4">
          <Stat label="Leads" value={leads.length} sub={`${leads.filter((l) => l.stage === "lost").length} lost`} />
          <Stat label="Paying" value={leads.filter((l) => l.stage === "paid").length} sub={leads.length ? `${Math.round((leads.filter((l) => l.stage === "paid").length / leads.length) * 100)}% of all leads` : "—"} />
          <Stat label="In play" value={money(pipelineValue)} sub="monthly, replied + demo" />
          <Stat label="Gone cold" value={stale.length} sub="no update in 7+ days" tone={stale.length ? "flame" : undefined} />
        </div>
        <div className="mt-6 grid grid-cols-5 gap-2">
          {funnel.map((f, i) => (
            <div key={f.s} className="min-w-0">
              <div className="flex h-20 items-end">
                <div className="w-full rounded-t-sm bg-ink" style={{ height: `${Math.max(4, (f.n / Math.max(1, funnel[0].n)) * 80)}px`, opacity: 1 - i * 0.13 }} />
              </div>
              <p className="mt-1.5 truncate text-xs text-muted">{STAGES.find((x) => x.id === f.s)!.label}</p>
              <p className="tnum text-sm font-medium">
                {f.n}
                {i > 0 && funnel[i - 1].n > 0 && <span className="ml-1 text-xs font-normal text-muted">{Math.round((f.n / funnel[i - 1].n) * 100)}%</span>}
              </p>
            </div>
          ))}
        </div>
        {worst && worst.rate < 0.5 && (
          <p className="mt-4 text-sm">
            <span className="font-medium">Biggest leak:</span> only {Math.round(worst.rate * 100)}% go from {worst.from.toLowerCase()} to {worst.to.toLowerCase()}. Fix that before you add more leads.
          </p>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Every deal"
          eyebrow="Move a lead forward the moment something happens"
          action={
            <button className="btn-primary text-sm" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" /> Add lead
            </button>
          }
        />
        {leads.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line px-4 py-10 text-center">
            <p className="font-medium">No leads yet</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-muted">Write down 20 people who have this problem. Then contact them. That&apos;s the job this week.</p>
          </div>
        ) : (
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="text-xs text-muted">
                  <th className="px-2 py-2 font-medium">Who</th>
                  <th className="px-2 py-2 font-medium">Stage</th>
                  <th className="px-2 py-2 font-medium">Value/mo</th>
                  <th className="px-2 py-2 font-medium">Next step</th>
                  <th className="px-2 py-2 font-medium">Updated</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {[...leads]
                  .sort((a, b) => ORDER.indexOf(b.stage) - ORDER.indexOf(a.stage) || (a.updatedAt < b.updatedAt ? 1 : -1))
                  .map((l) => {
                    const cold = !["paid", "lost"].includes(l.stage) && daysBetween(l.updatedAt, now) >= 7;
                    return (
                      <tr key={l.id} className="border-t border-line align-middle">
                        <td className="px-2 py-2.5">
                          <p className="font-medium">{l.name}</p>
                          <p className="text-xs text-muted">
                            {l.company || "—"} · {l.channel}
                          </p>
                        </td>
                        <td className="px-2 py-2.5">
                          <label htmlFor={`st-${l.id}`} className="sr-only">Stage for {l.name}</label>
                          <select id={`st-${l.id}`} className="field w-auto py-1 text-xs" value={l.stage} onChange={(e) => setStage(l, e.target.value as LeadStage)}>
                            {STAGES.map((s) => (
                              <option key={s.id} value={s.id}>{s.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="tnum px-2 py-2.5">{l.value ? money(l.value) : "—"}</td>
                        <td className="max-w-[220px] px-2 py-2.5 text-xs text-muted">{l.nextStep || "—"}</td>
                        <td className={cx("tnum whitespace-nowrap px-2 py-2.5 text-xs", cold ? "text-flame" : "text-muted")}>
                          {fmtDate(l.updatedAt)}
                          {cold && " · cold"}
                        </td>
                        <td className="px-2 py-2.5 text-right">
                          {confirmDel === l.id ? (
                            <span className="whitespace-nowrap">
                              <button className="px-1.5 text-xs font-medium text-flame" onClick={() => dispatch({ type: "LEAD_DELETE", id: l.id })}>Delete</button>
                              <button className="px-1.5 text-xs text-muted" onClick={() => setConfirmDel(null)}>Keep</button>
                            </span>
                          ) : (
                            <button aria-label={`Delete ${l.name}`} className="p-1 text-muted hover:text-flame" onClick={() => setConfirmDel(l.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add lead">
        <LeadForm
          onSave={(l) => {
            dispatch({ type: "LEAD_ADD", lead: l });
            setAdding(false);
          }}
        />
      </Modal>

      <Modal open={!!paidLead} onClose={() => setPaidLead(null)} title="They paid. Log it?">
        {paidLead && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Add {paidLead.name}&apos;s payment to your revenue log so it counts everywhere: check-ins, the ledger and your investor passport.
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setPaidLead(null)}>Not yet</button>
              <button
                className="btn-primary"
                onClick={() => {
                  dispatch({
                    type: "REVENUE_ADD",
                    entries: [{ id: `r${Date.now().toString(36)}`, date: today(), amount: paidLead.value || 0, currency: state.prefs.currency, customer: paidLead.company || paidLead.name, kind: "subscription" as const, source: "manual" as const, note: "From sales pipeline" }].filter((e) => e.amount > 0),
                    note: `Logged ${money(paidLead.value)} from ${paidLead.name}.`,
                  });
                  if (!paidLead.value) dispatch({ type: "SET_TAB", tab: "revenue" });
                  setPaidLead(null);
                }}
              >
                {paidLead.value ? `Log ${money(paidLead.value)}` : "Open Revenue to log it"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

function LeadForm({ onSave }: { onSave: (l: Lead) => void }) {
  const now = today();
  const [f, setF] = useState({ name: "", company: "", channel: "WhatsApp", stage: "lead" as LeadStage, value: "", nextStep: "" });
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!f.name.trim()) return setErr("Who is it?");
        onSave({ id: `l${Date.now().toString(36)}`, name: f.name.trim(), company: f.company.trim(), channel: f.channel.trim() || "Other", stage: f.stage, value: Math.max(0, Number(f.value) || 0), nextStep: f.nextStep.trim(), createdAt: now, updatedAt: now });
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="ld-name" className="mb-1.5 block text-xs font-medium text-muted">Name</label>
          <input id="ld-name" className="field" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </div>
        <div>
          <label htmlFor="ld-company" className="mb-1.5 block text-xs font-medium text-muted">Company</label>
          <input id="ld-company" className="field" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} />
        </div>
        <div>
          <label htmlFor="ld-channel" className="mb-1.5 block text-xs font-medium text-muted">Where you reach them</label>
          <input id="ld-channel" className="field" list="ld-channels" value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })} />
          <datalist id="ld-channels">
            {["WhatsApp", "Email", "LinkedIn", "Cold call", "In person", "Referral", "Reddit", "X"].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div>
          <label htmlFor="ld-value" className="mb-1.5 block text-xs font-medium text-muted">Value per month</label>
          <input id="ld-value" inputMode="decimal" className="field tnum" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} placeholder="0" />
        </div>
      </div>
      <div>
        <label htmlFor="ld-next" className="mb-1.5 block text-xs font-medium text-muted">Next step</label>
        <input id="ld-next" className="field" value={f.nextStep} onChange={(e) => setF({ ...f, nextStep: e.target.value })} placeholder="Send demo video on Thursday" />
      </div>
      {err && <p className="text-sm text-flame">{err}</p>}
      <button type="submit" className="btn-primary w-full">Add lead</button>
    </form>
  );
}

/* ----------------------------------------------------------- interviews -- */

function Interviews() {
  const { state, dispatch } = useStore();
  const [adding, setAdding] = useState(false);
  const list = state.interviews;

  const patterns = useMemo(() => {
    const m = new Map<string, number>();
    list.forEach((i) => new Set(i.pains.map((p) => p.trim().toLowerCase()).filter(Boolean)).forEach((p) => m.set(p, (m.get(p) ?? 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [list]);
  const pay = { yes: list.filter((i) => i.wouldPay === "yes").length, maybe: list.filter((i) => i.wouldPay === "maybe").length };
  const avgSev = list.length ? list.reduce((s, i) => s + i.severity, 0) / list.length : 0;
  const verdict =
    list.length < 5
      ? `${list.length}/5 interviews. Too few to trust any pattern yet.`
      : patterns[0] && patterns[0][1] / list.length >= 0.5 && pay.yes / list.length >= 0.3
        ? `Real signal: ${Math.round((patterns[0][1] / list.length) * 100)}% raise “${patterns[0][0]}” and ${Math.round((pay.yes / list.length) * 100)}% said they'd pay. Go sell.`
        : patterns[0] && patterns[0][1] / list.length >= 0.5
          ? `The pain is real (${Math.round((patterns[0][1] / list.length) * 100)}% mention “${patterns[0][0]}”), but few say they'd pay. Test price before you build more.`
          : "No pain shows up in half your interviews. You're hearing politeness, not a problem.";

  return (
    <>
      <Card>
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="grid grid-cols-2 content-start gap-x-6 gap-y-5">
            <Stat label="Interviews" value={list.length} />
            <Stat label="Would pay" value={list.length ? `${Math.round((pay.yes / list.length) * 100)}%` : "—"} sub={`${pay.maybe} maybe`} />
            <Stat label="Avg. pain" value={list.length ? `${avgSev.toFixed(1)}/5` : "—"} />
          </div>
          <div className="min-w-0">
            <p className="mb-3 text-xs text-muted">Pains that keep coming up</p>
            {patterns.length ? (
              <ul className="space-y-2">
                {patterns.map(([p, n]) => (
                  <li key={p}>
                    <div className="flex justify-between gap-2 text-sm">
                      <span className="truncate">{p}</span>
                      <span className="tnum shrink-0 text-muted">
                        {n}/{list.length}
                      </span>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-line/70">
                      <div className="h-full rounded-full bg-ink" style={{ width: `${(n / list.length) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Tag each interview with the pains they mention. Patterns appear here.</p>
            )}
          </div>
        </div>
        <p className="mt-5 border-t border-line pt-4 text-sm font-medium">{verdict}</p>
      </Card>

      <Card>
        <CardHeader
          title="Interview log"
          eyebrow="Log what they said, not what you hoped"
          action={
            <button className="btn-primary text-sm" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" /> Log interview
            </button>
          }
        />
        {list.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-4 py-10 text-center text-sm text-muted">No interviews logged. Talk to 5 people this week.</p>
        ) : (
          <ul className="-mx-2 divide-y divide-line">
            {[...list].reverse().map((i) => (
              <li key={i.id} className="group px-2 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {i.person} <span className="font-normal text-muted">· {i.role}</span>
                    </p>
                    <p className="text-xs text-muted">
                      {fmtDate(i.date)} · pain {i.severity}/5 · would pay: {i.wouldPay}
                    </p>
                  </div>
                  <button aria-label={`Delete interview with ${i.person}`} className="p-1 text-muted opacity-50 hover:text-flame group-hover:opacity-100" onClick={() => dispatch({ type: "INTERVIEW_DELETE", id: i.id })}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {i.quote && <p className="mt-1.5 border-l-2 border-line pl-3 text-sm text-muted">“{i.quote}”</p>}
                {i.pains.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {i.pains.map((p) => (
                      <Badge key={p}>{p}</Badge>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal open={adding} onClose={() => setAdding(false)} title="Log interview">
        <InterviewForm
          known={patterns.map(([p]) => p)}
          onSave={(i) => {
            dispatch({ type: "INTERVIEW_ADD", interview: i });
            setAdding(false);
          }}
        />
      </Modal>
    </>
  );
}

function InterviewForm({ known, onSave }: { known: string[]; onSave: (i: Interview) => void }) {
  const [f, setF] = useState({ person: "", role: "", date: today(), pains: "", quote: "", wouldPay: "maybe" as Interview["wouldPay"], severity: 3 as Interview["severity"] });
  const [err, setErr] = useState<string | null>(null);
  const addTag = (t: string) => {
    const cur = f.pains.split(",").map((x) => x.trim()).filter(Boolean);
    if (!cur.includes(t)) setF({ ...f, pains: [...cur, t].join(", ") });
  };
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!f.person.trim()) return setErr("Who did you talk to?");
        onSave({
          id: `i${Date.now().toString(36)}`,
          date: f.date,
          person: f.person.trim(),
          role: f.role.trim() || "—",
          pains: f.pains.split(",").map((p) => p.trim().toLowerCase()).filter(Boolean).slice(0, 8),
          quote: f.quote.trim(),
          wouldPay: f.wouldPay,
          severity: f.severity,
        });
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="iv-person" className="mb-1.5 block text-xs font-medium text-muted">Person</label>
          <input id="iv-person" className="field" value={f.person} onChange={(e) => setF({ ...f, person: e.target.value })} />
        </div>
        <div>
          <label htmlFor="iv-role" className="mb-1.5 block text-xs font-medium text-muted">Role</label>
          <input id="iv-role" className="field" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} placeholder="Clinic owner" />
        </div>
      </div>
      <div>
        <label htmlFor="iv-pains" className="mb-1.5 block text-xs font-medium text-muted">Pains they mentioned (comma separated)</label>
        <input id="iv-pains" className="field" value={f.pains} onChange={(e) => setF({ ...f, pains: e.target.value })} placeholder="no-shows, manual reminders" />
        {known.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {known.map((k) => (
              <button key={k} type="button" onClick={() => addTag(k)} className="rounded-full border border-line px-2 py-0.5 text-xs text-muted hover:text-ink">
                + {k}
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <label htmlFor="iv-quote" className="mb-1.5 block text-xs font-medium text-muted">Best quote, in their words</label>
        <textarea id="iv-quote" rows={2} className="field resize-none" value={f.quote} onChange={(e) => setF({ ...f, quote: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="iv-pay" className="mb-1.5 block text-xs font-medium text-muted">Would they pay?</label>
          <select id="iv-pay" className="field" value={f.wouldPay} onChange={(e) => setF({ ...f, wouldPay: e.target.value as Interview["wouldPay"] })}>
            <option value="yes">Yes, named a price</option>
            <option value="maybe">Maybe</option>
            <option value="no">No</option>
          </select>
        </div>
        <div>
          <label htmlFor="iv-sev" className="mb-1.5 block text-xs font-medium text-muted">How painful (1–5)</label>
          <input id="iv-sev" type="range" min={1} max={5} className="w-full accent-current" value={f.severity} onChange={(e) => setF({ ...f, severity: Number(e.target.value) as Interview["severity"] })} />
          <p className="tnum text-xs text-muted">{f.severity}/5</p>
        </div>
      </div>
      <div>
        <label htmlFor="iv-date" className="mb-1.5 block text-xs font-medium text-muted">Date</label>
        <input id="iv-date" type="date" max={today()} className="field" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
      </div>
      {err && <p className="text-sm text-flame">{err}</p>}
      <button type="submit" className="btn-primary w-full">Save interview</button>
    </form>
  );
}
