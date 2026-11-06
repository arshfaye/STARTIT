"use client";

import { Flag } from "lucide-react";
import { useState } from "react";
import { addDays, fmtDate, today } from "@/lib/engine";
import { decisionDue, fmtMetric, METRICS, metricValue } from "@/lib/decisions";
import { useStore } from "@/lib/store";
import type { Decision, KillMetric } from "@/lib/types";
import { Card, CardHeader, Modal, ProgressBar, cx } from "./ui";

/** The founder's own pass/fail line, set in advance so the decision isn't made on vibes. */
export function KillCriteriaCard() {
  const { state, dispatch } = useStore();
  const k = state.killCriteria;
  const [editing, setEditing] = useState(!k);
  const [f, setF] = useState({ metric: (k?.metric ?? "paying_customers") as KillMetric, target: String(k?.target ?? 5), deadline: k?.deadline ?? addDays(today(), 42) });
  const [err, setErr] = useState<string | null>(null);
  const due = decisionDue(state);

  if (editing) {
    return (
      <Card>
        <CardHeader title="Set your kill criteria" eyebrow="Decide now what failure looks like, so you can't move the goalposts later" />
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const target = Number(f.target);
            if (!(target > 0)) return setErr("Pick a target above zero.");
            if (f.deadline <= today()) return setErr("The deadline has to be in the future.");
            dispatch({ type: "KILL_SET", criteria: { metric: f.metric, target, deadline: f.deadline, setAt: today() } });
            setEditing(false);
            setErr(null);
          }}
        >
          <p className="text-sm">If I don&apos;t have</p>
          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
            <label htmlFor="kc-target" className="sr-only">Target</label>
            <input id="kc-target" inputMode="decimal" className="field tnum" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} />
            <label htmlFor="kc-metric" className="sr-only">Metric</label>
            <select id="kc-metric" className="field" value={f.metric} onChange={(e) => setF({ ...f, metric: e.target.value as KillMetric })}>
              {METRICS.map((m) => (
                <option key={m.id} value={m.id}>{m.label.toLowerCase()}{m.unit === "money" ? ` (${state.prefs.currency})` : ""}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor="kc-deadline">by</label>
            <input id="kc-deadline" type="date" min={addDays(today(), 1)} className="field w-auto" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} />
          </div>
          <p className="text-sm">…I stop, pivot or prove why I shouldn&apos;t.</p>
          {err && <p className="text-sm text-flame">{err}</p>}
          <div className="flex gap-2">
            <button type="submit" className="btn-primary">Lock it in</button>
            {k && <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>}
          </div>
        </form>
      </Card>
    );
  }
  if (!k) return null;
  const v = metricValue(state, k.metric);
  const label = METRICS.find((m) => m.id === k.metric)!.label;
  const daysLeft = Math.round((Date.parse(k.deadline) - Date.parse(today())) / 86_400_000);
  const pct = Math.min(100, (v / k.target) * 100);
  return (
    <Card className={due ? "border-flame/40" : ""}>
      <CardHeader
        title="Kill criteria"
        eyebrow={`Set ${fmtDate(k.setAt)} · you can't edit it until you decide`}
        icon={<Flag className="h-4 w-4" />}
      />
      <p className="text-sm text-muted">{label}</p>
      <p className="tnum mt-1 text-2xl font-semibold tracking-tight">
        {fmtMetric(k.metric, v)} <span className="text-base font-normal text-muted">of {fmtMetric(k.metric, k.target)}</span>
      </p>
      <ProgressBar value={pct} className="mt-3" tone={!due && daysLeft <= 7 && pct < 70 ? "flame" : undefined} />
      <p className={cx("mt-2 text-xs", due ? "text-flame" : daysLeft <= 7 ? "text-amber" : "text-muted")}>
        {due ? `Deadline was ${fmtDate(k.deadline)}. Time to decide.` : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left · deadline ${fmtDate(k.deadline)}`}
      </p>
      {due && <DecisionButton className="mt-4 w-full" />}
    </Card>
  );
}

export function DecisionBanner() {
  const { state } = useStore();
  if (!decisionDue(state)) return null;
  const k = state.killCriteria!;
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-flame/40 px-4 py-3">
      <p className="text-sm">
        <span className="font-medium text-flame">Decision day.</span> You said {fmtMetric(k.metric, k.target)} {METRICS.find((m) => m.id === k.metric)!.label.toLowerCase()} by {fmtDate(k.deadline)}. You have{" "}
        {fmtMetric(k.metric, metricValue(state, k.metric))}.
      </p>
      <DecisionButton />
    </div>
  );
}

function DecisionButton({ className }: { className?: string }) {
  const { state, dispatch } = useStore();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<Decision["choice"] | null>(null);
  const [note, setNote] = useState("");
  const [next, setNext] = useState({ target: "", deadline: addDays(today(), 42) });
  const k = state.killCriteria!;
  const v = metricValue(state, k.metric);
  const hit = v >= k.target;

  const OPTIONS: { id: Decision["choice"]; title: string; desc: string }[] = [
    { id: "double-down", title: "Double down", desc: hit ? "You hit it. Set a bigger target." : "You missed it. Only pick this if you can say exactly what changes." },
    { id: "pivot", title: "Pivot", desc: "Keep what you learned, change the customer or the problem." },
    { id: "kill", title: "Kill it", desc: "Stop. Take the lessons to the next idea. This is a win, not a failure." },
  ];

  const commit = () => {
    if (!choice) return;
    if (note.trim().length < 15) return;
    const snapshot = `${fmtMetric(k.metric, v)} of ${fmtMetric(k.metric, k.target)} ${k.metric.replace("_", " ")}`;
    dispatch({ type: "DECISION_ADD", decision: { id: `d${Date.now().toString(36)}`, at: today(), choice, note: note.trim(), snapshot } });
    if (choice === "double-down" && Number(next.target) > 0) {
      dispatch({ type: "KILL_SET", criteria: { metric: k.metric, target: Number(next.target), deadline: next.deadline, setAt: today() } });
    }
    if (choice === "pivot") dispatch({ type: "SET_TAB", tab: "audit" });
    dispatch({ type: "TOAST", tone: choice === "kill" ? "warn" : "ok", text: choice === "kill" ? "Decision logged. Rewrite your pitch in the Idea Audit when you're ready." : "Decision logged." });
    if (choice === "kill") dispatch({ type: "SET_TAB", tab: "audit" });
    setOpen(false);
  };

  return (
    <>
      <button className={cx("btn-danger", className)} onClick={() => setOpen(true)}>Make the call</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Decision day" wide>
        <div className="space-y-4">
          <p className="text-sm">
            Target: <b>{fmtMetric(k.metric, k.target)}</b> {METRICS.find((m) => m.id === k.metric)!.label.toLowerCase()}. Actual: <b className={hit ? "text-emerald" : "text-flame"}>{fmtMetric(k.metric, v)}</b>.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {OPTIONS.map((o) => (
              <button
                key={o.id}
                onClick={() => setChoice(o.id)}
                aria-pressed={choice === o.id}
                className={cx("rounded-xl border p-3 text-left transition", choice === o.id ? "border-ink bg-abyss" : "border-line hover:bg-abyss")}
              >
                <p className="text-sm font-medium">{o.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">{o.desc}</p>
              </button>
            ))}
          </div>
          {choice === "double-down" && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label htmlFor="dd-target">New target</label>
              <input id="dd-target" inputMode="decimal" className="field w-28 tnum" value={next.target} onChange={(e) => setNext({ ...next, target: e.target.value })} placeholder={String(Math.ceil(k.target * 2))} />
              <label htmlFor="dd-deadline">by</label>
              <input id="dd-deadline" type="date" className="field w-auto" value={next.deadline} min={addDays(today(), 1)} onChange={(e) => setNext({ ...next, deadline: e.target.value })} />
            </div>
          )}
          <div>
            <label htmlFor="dd-note" className="mb-1.5 block text-xs font-medium text-muted">Why? Write it like you'll read it in a year.</label>
            <textarea id="dd-note" rows={3} className="field resize-none" value={note} onChange={(e) => setNote(e.target.value)} />
            {note.trim().length > 0 && note.trim().length < 15 && <p className="mt-1 text-xs text-muted">A real reason, please. At least a sentence.</p>}
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <button
              className="btn-ghost text-sm"
              onClick={() => {
                setOpen(false);
                dispatch({ type: "ASK_COFOUNDER", prompt: "It's decision day on my kill criteria. Look at my numbers and tell me straight: double down, pivot or kill? Defend your answer." });
              }}
            >
              Ask the co-founder first
            </button>
            <button className="btn-primary" disabled={!choice || note.trim().length < 15 || (choice === "double-down" && !(Number(next.target) > 0))} onClick={commit}>
              Commit to this decision
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
