"use client";

import { CalendarClock, Check, Clock, Code2, FlaskConical, Hammer, Plus, Rocket, Sparkles, TimerOff, Trash2, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { addDays, codePrompt, daysBetween, fmtDate, today } from "@/lib/engine";
import { CofounderError, errorCopy } from "@/lib/cofounder";
import { rebuildPlan, type PlanSuggestion } from "@/lib/decisions";
import { useStore } from "@/lib/store";
import type { Phase, Task } from "@/lib/types";
import { Badge, Card, CopyButton, Modal, ProgressBar, cx } from "../ui";

const PHASES: { id: Phase; icon: typeof Rocket; blurb: string; tone: string }[] = [
  { id: "Validation", icon: FlaskConical, blurb: "Week 1 · Prove someone will pay before you write product code.", tone: "text-muted" },
  { id: "MVP Build", icon: Hammer, blurb: "Weeks 2–3 · One workflow, end to end, in front of real users.", tone: "text-muted" },
  { id: "Early-Adopter Launch", icon: Rocket, blurb: "Week 4 · Get your first 10 paying customers.", tone: "text-muted" },
  { id: "Growth", icon: TrendingUp, blurb: "Week 5 onward · Sell, ship, measure, repeat. The co-founder keeps this list moving.", tone: "text-muted" },
];

export function Timetable() {
  const { state, dispatch } = useStore();
  const [promptTask, setPromptTask] = useState<Task | null>(null);
  const now = today();

  const total = state.tasks.length;
  const done = state.tasks.filter((t) => t.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const overdue = state.tasks.filter((t) => !t.done && t.due < now).length;
  const delayed = state.tasks.filter((t) => t.delayed && !t.done).length;
  const currentWeek = Math.max(1, Math.floor(daysBetween(state.startDate, now) / 7) + 1);
  const [plan, setPlan] = useState<{ busy: boolean; items: (PlanSuggestion & { on: boolean })[]; error: string | null } | null>(null);
  const rebuild = async () => {
    setPlan({ busy: true, items: [], error: null });
    try {
      const items = await rebuildPlan(state);
      setPlan({ busy: false, items: items.map((x) => ({ ...x, on: true })), error: items.length ? null : "No suggestions came back. Try again." });
    } catch (e) {
      const err = e instanceof CofounderError ? e : new CofounderError("upstream_error", String(e));
      setPlan({ busy: false, items: [], error: errorCopy(err.code) });
    }
  };

  const byPhase = useMemo(
    () =>
      PHASES.map((p) => ({ ...p, tasks: state.tasks.filter((t) => t.phase === p.id) })).filter(
        (p) => p.id !== "Growth" || p.tasks.length > 0 || currentWeek >= 4,
      ),
    [state.tasks, currentWeek],
  );

  return (
    <div className="space-y-5">
      {/* Summary */}
      <Card strong>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <p className="eyebrow mb-1">Execution timetable · {state.idea.name}</p>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h2 className="tnum text-5xl font-semibold tracking-tight text-ink">
                {pct}
                <span className="text-2xl text-muted">%</span>
              </h2>
              <p className="text-sm text-muted">
                {done} of {total} tasks shipped · {currentWeek <= 4 ? <>Week <span className="text-ink">{currentWeek}</span> of 4</> : <>Week <span className="text-ink">{currentWeek}</span>, past the first 4</>}
              </p>
            </div>
            <ProgressBar value={pct} className="mt-4 h-3" />
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted">
              {[1, 2, 3, 4].map((w) => {
                const wt = state.tasks.filter((t) => t.week === w);
                const wd = wt.filter((t) => t.done).length;
                return (
                  <span key={w} className={w === currentWeek ? "font-medium text-ink" : ""}>
                    WK{w} {wd}/{wt.length}
                  </span>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 lg:flex-col lg:items-end">
            <button className="btn-primary text-sm" onClick={rebuild}>
              <Sparkles className="h-4 w-4" /> Rebuild my plan
            </button>
            {overdue > 0 ? (
              <Badge tone="flame" glow>
                <TimerOff className="h-3.5 w-3.5" /> {overdue} overdue
              </Badge>
            ) : (
              <Badge tone="emerald">
                <Check className="h-3.5 w-3.5" /> Nothing overdue
              </Badge>
            )}
            {delayed > 0 && (
              <Badge tone="amber">
                <Clock className="h-3.5 w-3.5" /> {delayed} delayed by penalty
              </Badge>
            )}
          </div>
        </div>
      </Card>

      {/* Phases */}
      <div className={cx("grid gap-5", byPhase.length === 4 ? "md:grid-cols-2" : "xl:grid-cols-3")}>
        {byPhase.map((phase) => {
          const pd = phase.tasks.filter((t) => t.done).length;
          const ppct = phase.tasks.length ? Math.round((pd / phase.tasks.length) * 100) : 0;
          const Icon = phase.icon;
          return (
            <Card key={phase.id} className="flex flex-col">
              <div className="mb-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Icon className={cx("h-4 w-4", phase.tone)} />
                    <h3 className="font-semibold tracking-tight">{phase.id}</h3>
                  </div>
                  <span className="tnum text-sm text-muted">{ppct}%</span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-muted">{phase.blurb}</p>
                <ProgressBar value={ppct} className="mt-3 h-1.5"  />
              </div>
              <ul className="space-y-2.5">
                {phase.tasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    now={now}
                    onToggle={() => dispatch({ type: "TOGGLE_TASK", id: t.id })}
                    onPrompt={() => setPromptTask(t)}
                    onMissed={() => dispatch({ type: "MISSED_DEADLINE", ids: [t.id] })}
                    onDelete={() => dispatch({ type: "TASK_DELETE", id: t.id })}
                  />
                ))}
              </ul>
              <AddTask phase={phase.id} onAdd={(title, due, tech) => dispatch({ type: "TASK_ADD", title, phase: phase.id, due, tech })} />
            </Card>
          );
        })}
      </div>

      <Modal open={!!plan} onClose={() => setPlan(null)} title="Your co-founder's next moves" wide>
        {plan?.busy && <p className="py-8 text-center text-sm text-muted animate-pulse">Reading your numbers and rebuilding the plan…</p>}
        {plan?.error && <p className="text-sm text-flame">{plan.error}</p>}
        {plan && !plan.busy && plan.items.length > 0 && (
          <div className="space-y-4">
            <p className="text-sm text-muted">Based on your pipeline, revenue, interviews and what slipped. Untick anything you won&apos;t commit to. Deadlines lock once added.</p>
            <ul className="space-y-2">
              {plan.items.map((x, i) => (
                <li key={i}>
                  <label className="flex cursor-pointer gap-3 rounded-lg border border-line p-3 hover:bg-abyss">
                    <input
                      type="checkbox"
                      checked={x.on}
                      onChange={() => setPlan({ ...plan, items: plan.items.map((y, j) => (j === i ? { ...y, on: !y.on } : y)) })}
                      className="mt-1 accent-current"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{x.title}</span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {x.phase} · due {fmtDate(addDays(now, x.dueInDays))}
                        {x.tech ? " · needs code" : ""}
                      </span>
                      {x.why && <span className="mt-1 block text-xs text-muted">{x.why}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setPlan(null)}>Cancel</button>
              <button
                className="btn-primary"
                disabled={!plan.items.some((x) => x.on)}
                onClick={() => {
                  dispatch({ type: "TASKS_ADD_MANY", tasks: plan.items.filter((x) => x.on).map((x) => ({ title: x.title, phase: x.phase, due: addDays(now, x.dueInDays), tech: x.tech })) });
                  setPlan(null);
                }}
              >
                Commit to {plan.items.filter((x) => x.on).length} task{plan.items.filter((x) => x.on).length === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!promptTask} onClose={() => setPromptTask(null)} title="AI code prompt" wide>
        {promptTask && (
          <>
            <p className="mb-3 text-sm text-muted">
              Paste this into Claude, Cursor or your coding agent. It&apos;s scoped to <span className="text-ink">{promptTask.title.toLowerCase()}</span> for{" "}
              {state.idea.name}.
            </p>
            <pre className="font-mono max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-obsidian p-4 text-xs leading-relaxed text-ink/90">
              {codePrompt(promptTask, state.idea)}
            </pre>
            <div className="mt-4 flex justify-end">
              <CopyButton text={codePrompt(promptTask, state.idea)} label="Copy prompt" />
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

function TaskRow({ task: t, now, onToggle, onPrompt, onMissed, onDelete }: { task: Task; now: string; onToggle: () => void; onPrompt: () => void; onMissed: () => void; onDelete: () => void }) {
  const overdue = !t.done && t.due < now;
  const [confirm, setConfirm] = useState(false);
  const daysLeft = daysBetween(now, t.due);
  return (
    <li
      className={cx(
        "group rounded-xl border p-3 transition",
        t.done ? "border-line bg-abyss" : overdue ? "border-flame/40 bg-surface" : t.delayed ? "border-amber/40 bg-surface" : "border-line bg-surface hover:border-muted/40",
      )}
    >
      <div className="flex items-start gap-3">
        <button
          role="checkbox"
          aria-checked={t.done}
          aria-label={`Mark "${t.title}" ${t.done ? "not done" : "done"}`}
          onClick={onToggle}
          className={cx(
            "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyber/60",
            t.done ? "border-ink bg-ink text-obsidian" : "border-muted/50 hover:border-ink",
          )}
        >
          {t.done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p className={cx("min-w-0 flex-1 text-sm leading-snug", t.done ? "text-muted line-through decoration-muted/50" : "text-ink")}>{t.title}</p>
            <button
              onClick={() => setConfirm(true)}
              aria-label={`Delete "${t.title}"`}
              className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-muted opacity-50 transition hover:bg-abyss hover:text-flame group-hover:opacity-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span
              className={cx(
                "tnum inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px]",
                t.done ? "bg-abyss text-muted" : overdue ? "bg-flame/10 text-flame" : t.delayed ? "bg-amber/10 text-amber" : "bg-abyss text-muted",
              )}
            >
              <CalendarClock className="h-3 w-3" />
              {fmtDate(t.due)}
              {!t.done && (overdue ? ` · ${-daysLeft}d late` : daysLeft <= 3 ? ` · ${daysLeft}d left` : "")}
            </span>
            {t.delayed && (
              <span className="inline-flex items-center rounded-md bg-amber/10 px-1.5 py-0.5 text-[10px] text-amber" title={`Originally due ${fmtDate(t.originalDue)}`}>
                DELAYED +{t.penalties * 14}d · was <span className="ml-1 line-through">{fmtDate(t.originalDue)}</span>
              </span>
            )}
            <span className="text-[10px] text-muted/70">WK{t.week}</span>
            {t.custom && <span className="text-[10px] text-muted/70">· Yours</span>}
          </div>
          {!t.done && (t.tech || overdue) && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {t.tech && (
                <button onClick={onPrompt} className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[11px] font-medium text-ink transition hover:bg-abyss">
                  <Code2 className="h-3 w-3" /> Generate AI Code Prompts
                </button>
              )}
              {overdue && (
                <button onClick={onMissed} className="inline-flex items-center gap-1.5 rounded-md border border-flame/30 px-2 py-1 text-[11px] font-medium text-flame transition hover:bg-flame/5">
                  <TimerOff className="h-3 w-3" /> Accept penalty (+14d)
                </button>
              )}
            </div>
          )}
          {confirm && (
            <div className="mt-2.5 rounded-lg border border-line bg-abyss p-2.5">
              <p className="text-xs leading-relaxed">
                {overdue ? (
                  <>
                    <span className="font-medium text-flame">This task is overdue.</span> Deleting it still counts as a missed deadline (−35).
                  </>
                ) : (
                  "Delete this task?"
                )}
              </p>
              <div className="mt-2 flex gap-1.5">
                <button onClick={onDelete} className="rounded-md bg-flame px-2.5 py-1 text-[11px] font-medium text-white">
                  Delete
                </button>
                <button onClick={() => setConfirm(false)} className="rounded-md px-2.5 py-1 text-[11px] text-muted hover:text-ink">
                  Keep it
                </button>
              </div>
            </div>
          )}
          {t.done && t.tech && (
            <button onClick={onPrompt} className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted hover:text-ink">
              <Code2 className="h-3 w-3" /> View prompt
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function AddTask({ phase, onAdd }: { phase: Phase; onAdd: (title: string, due: string, tech: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(() => addDays(today(), 3));
  const [tech, setTech] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const id = phase.replace(/\W+/g, "-").toLowerCase();

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mt-2.5 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted transition hover:bg-abyss hover:text-ink">
        <Plus className="h-4 w-4" /> Add task
      </button>
    );
  }
  return (
    <form
      className="mt-2.5 space-y-2.5 rounded-xl border border-line p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return setErr("Say what needs to get done.");
        if (due < today()) return setErr("The deadline can't be in the past.");
        onAdd(title.trim(), due, tech);
        setTitle("");
        setTech(false);
        setErr(null);
        setOpen(false);
      }}
    >
      <label htmlFor={`nt-title-${id}`} className="sr-only">Task</label>
      <input id={`nt-title-${id}`} autoFocus className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What will you ship?" />
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`nt-due-${id}`} className="text-xs text-muted">Due</label>
        <input id={`nt-due-${id}`} type="date" min={today()} className="field w-auto py-1.5" value={due} onChange={(e) => setDue(e.target.value)} />
        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" checked={tech} onChange={(e) => setTech(e.target.checked)} className="accent-current" /> Needs code
        </label>
      </div>
      {err && <p className="text-xs text-flame">{err}</p>}
      <div className="flex gap-2">
        <button type="submit" className="btn-primary flex-1 py-1.5 text-xs">Add task</button>
        <button type="button" className="btn-ghost py-1.5 text-xs" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      <p className="text-[11px] leading-relaxed text-muted">Deadlines lock once set. Miss it and the usual penalty applies.</p>
    </form>
  );
}
