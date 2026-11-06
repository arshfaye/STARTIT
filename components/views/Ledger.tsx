"use client";

import { Award, BadgeCheck, CheckCircle2, FileText, Flame, Lock, Radar, Share2, ShieldAlert, Sparkles, Trophy, Users, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { fmtDate, today } from "@/lib/engine";
import { money } from "@/lib/locale";
import { revenueTotals } from "@/lib/revenue";
import { CofounderError, errorCopy } from "@/lib/cofounder";
import { draftInvestorUpdate, type InvestorUpdate } from "@/lib/decisions";
import { useStore } from "@/lib/store";
import { ensurePlan, useBilling } from "@/lib/usePlan";
import { Badge, Card, CardHeader, CopyButton, GradeBadge, Modal, Stat, cx } from "../ui";

type Event = { date: string; kind: "task" | "checkin" | "penalty" | "audit"; title: string; meta?: string };

export function Ledger() {
  const { state, exec } = useStore();
  const [open, setOpen] = useState(false);

  const totals = useMemo(
    () => ({
      interviews: state.checkIns.reduce((a, c) => a + c.interviews, 0),
      signups: state.checkIns.reduce((a, c) => a + c.signups, 0),
      revenue: revenueTotals(state.revenue, state.prefs.currency, today()).total,
      mrr: revenueTotals(state.revenue, state.prefs.currency, today()).mrr,
      shipped: state.tasks.filter((t) => t.done).length,
      onTime: state.tasks.filter((t) => t.done && t.doneAt && t.doneAt <= t.originalDue).length,
    }),
    [state.checkIns, state.tasks, state.revenue, state.prefs.currency],
  );

  const events = useMemo<Event[]>(() => {
    const e: Event[] = [];
    if (state.analysis) e.push({ date: state.startDate, kind: "audit", title: `Idea audited · Kill Score ${state.analysis.killScore}%`, meta: state.analysis.saturation });
    state.tasks.filter((t) => t.done && t.doneAt).forEach((t) => e.push({ date: t.doneAt!, kind: "task", title: t.title, meta: t.phase }));
    state.checkIns.forEach((c) => e.push({ date: c.submittedAt, kind: "checkin", title: `Week ${c.week} graded ${c.grade}`, meta: `${c.score}/1000` }));
    state.penalties.forEach((p) =>
      e.push({ date: p.at, kind: "penalty", title: p.reason === "deleted" ? `Deleted an overdue task · ${p.titles?.[0] ?? ""}` : `Missed deadline · ${p.taskIds.length} task(s) pushed +${p.days}d` }),
    );
    const firstPaid = [...state.revenue].filter((r) => r.currency === state.prefs.currency).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
    if (firstPaid) e.push({ date: firstPaid.date, kind: "task", title: `First revenue · ${money(firstPaid.amount)} from ${firstPaid.customer}` });
    return e.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.kind === "checkin" ? -1 : 1));
  }, [state]);

  const validationDone = state.tasks.filter((t) => t.phase === "Validation").every((t) => t.done);
  const achievements = [
    { icon: Radar, title: "Survived the audit", desc: "Ran a brutal idea audit", got: !!state.analysis },
    { icon: Zap, title: "First blood", desc: "Shipped your first task", got: totals.shipped > 0 },
    { icon: CheckCircle2, title: "Validated", desc: "Completed the validation phase", got: validationDone },
    { icon: Users, title: "Talked to 10", desc: "10+ customer interviews", got: totals.interviews >= 10 },
    { icon: Flame, title: "Two-week streak", desc: "Two weeks graded B or better", got: exec.streak >= 2 },
    { icon: Trophy, title: "First revenue", desc: "Logged your first payment", got: totals.revenue > 0 },
    { icon: Award, title: "A-grade founder", desc: "Reach an A execution grade", got: exec.score >= 800 },
    { icon: Sparkles, title: "Clean sheet", desc: "Four weeks, zero penalties", got: state.checkIns.length >= 4 && state.penalties.length === 0 },
  ];

  const weeks = [1, 2, 3, 4].map((w) => state.checkIns.find((c) => c.week === w));

  return (
    <div className="space-y-5">
      <Card strong>
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <GradeBadge grade={exec.grade} size="md" />
            <div>
              <p className="eyebrow">Success ledger · {state.idea.name}</p>
              <h2 className="text-2xl font-semibold tracking-tight">
                <span className="tnum">{exec.score}</span>
                <span className="text-base font-normal text-muted"> execution score</span>
              </h2>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <InvestorUpdateButton />
            <button className="btn-primary" onClick={() => setOpen(true)}>
              <Share2 className="h-4 w-4" /> Share live investor passport
            </button>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Tasks shipped" value={`${totals.shipped}/${state.tasks.length}`} sub={`${totals.onTime} on original deadline`} tone="emerald" />
          <Stat label="Interviews" value={totals.interviews} sub="logged in check-ins" />
          <Stat label="Signups" value={totals.signups} sub="waitlist + product" tone="cyber" />
          <Stat label="Revenue" value={money(totals.revenue)} sub={totals.revenue ? `MRR ${money(totals.mrr)}` : "not yet. Fix that."} tone={totals.revenue ? "emerald" : "amber"} />
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader eyebrow="Timeline" title="Milestones, grades and penalties" icon={<BadgeCheck className="h-4 w-4" />} />
          <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[11px] before:top-2 before:w-px before:bg-line">
            {events.map((e, i) => {
              const tone =
                e.kind === "penalty" ? "border-flame/40 bg-surface text-flame" : "border-line bg-surface text-muted";
              const Icon = e.kind === "penalty" ? ShieldAlert : e.kind === "checkin" ? Award : e.kind === "audit" ? Radar : CheckCircle2;
              return (
                <li key={i} className="relative grid grid-cols-[24px_minmax(0,1fr)] gap-3">
                  <span className={cx("z-10 grid h-6 w-6 place-items-center rounded-full border", tone)}>
                    <Icon className="h-3 w-3" />
                  </span>
                  <div className="min-w-0 pb-1">
                    <p className="text-sm leading-snug text-ink">{e.title}</p>
                    <p className="tnum mt-0.5 text-[11px] text-muted">
                      {fmtDate(e.date)}
                      {e.meta && ` · ${e.meta}`}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>

        <div className="grid min-w-0 content-start gap-5">
          <Card>
            <CardHeader eyebrow="Grade streak" title={`${exec.streak}-week B-or-better streak`} icon={<Flame className="h-4 w-4 text-amber" />} />
            <div className="grid grid-cols-4 gap-2">
              {weeks.map((c, i) => (
                <div key={i} className={cx("rounded-xl border p-3 text-center", c ? "border-line bg-abyss" : "border-dashed border-line")}>
                  <p className="eyebrow mb-2">W{i + 1}</p>
                  {c ? <div className="flex justify-center"><GradeBadge grade={c.grade} size="sm" /></div> : <p className="py-1.5 text-xs text-muted">—</p>}
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <CardHeader eyebrow="Achievements" title={`${achievements.filter((a) => a.got).length} of ${achievements.length} unlocked`} icon={<Trophy className="h-4 w-4" />} />
            <div className="grid grid-cols-2 gap-2">
              {achievements.map((a) => {
                const Icon = a.got ? a.icon : Lock;
                return (
                  <div
                    key={a.title}
                    className={cx(
                      "rounded-xl border p-3 transition",
                      a.got ? "border-line bg-surface" : "border-dashed border-line opacity-50",
                    )}
                  >
                    <Icon className={cx("mb-2 h-4 w-4", a.got ? "text-ink" : "text-muted")} />
                    <p className="text-sm font-medium leading-tight">{a.title}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted">{a.desc}</p>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>

      <PassportModal open={open} onClose={() => setOpen(false)} totals={totals} />
    </div>
  );
}

function PassportModal({ open, onClose, totals }: { open: boolean; onClose: () => void; totals: { interviews: number; signups: number; revenue: number; mrr: number; shipped: number; onTime: number } }) {
  const { state, exec } = useStore();
  const slug = state.idea.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const stamp = (exec.score * 7919 + totals.shipped * 104729).toString(16).slice(-6).toUpperCase();
  const url = `https://startit.app/p/${slug}-${stamp.toLowerCase()}`;
  const onTimeRate = totals.shipped ? Math.round((totals.onTime / totals.shipped) * 100) : 0;
  const stats = [
    ["Execution score", `${exec.score}/1000`],
    ["Roadmap shipped", `${Math.round(exec.overallRate * 100)}%`],
    ["On-time delivery", `${onTimeRate}%`],
    ["Customer interviews", `${totals.interviews}`],
    ["Signups", `${totals.signups}`],
    ["Revenue", money(totals.revenue)],
    ["MRR", money(totals.mrr)],
    ["Penalties taken", `${state.penalties.reduce((a, p) => a + p.taskIds.length, 0)}`],
  ];

  return (
    <Modal open={open} onClose={onClose} title="Live investor passport" wide>
      <div className="relative overflow-hidden rounded-xl border border-line bg-abyss p-5 sm:p-6">
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">startit · Investor passport</p>
            <h3 className="mt-1 text-2xl font-semibold tracking-tight">{state.idea.name}</h3>
            <p className="mt-1 max-w-md text-sm text-muted">{state.analysis?.pivot.niche ?? state.idea.audience}</p>
          </div>
          <GradeBadge grade={exec.grade} />
        </div>
        <dl className="relative mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          {stats.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="truncate text-[10px] text-muted">{k}</dt>
              <dd className="tnum text-lg text-ink">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="relative mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
          <Badge tone="emerald">
            <BadgeCheck className="h-3.5 w-3.5" /> Verified from logged activity
          </Badge>
          <span className="text-[11px] text-muted">STAMP #{stamp} · {fmtDate(today())}</span>
        </div>
      </div>
      <p className="mt-4 text-xs text-muted">
        Numbers come from your check-ins and task history, including penalties. Investors see the misses too, which is why they trust it.
      </p>
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-obsidian p-2 pl-3">
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted">{url}</span>
        <CopyButton text={url} label="Copy link" />
      </div>
    </Modal>
  );
}

/** Scale: the co-founder drafts this month's investor update from the logged numbers. */
function InvestorUpdateButton() {
  const { state } = useStore();
  const { plan } = useBilling();
  const [draft, setDraft] = useState<{ busy: boolean; update: InvestorUpdate | null; error: string | null } | null>(null);
  const locked = plan != null && plan !== "scale";

  const run = async () => {
    if (!ensurePlan(plan, "scale", "AI investor updates are part of Scale.")) return;
    setDraft({ busy: true, update: null, error: null });
    try {
      setDraft({ busy: false, update: await draftInvestorUpdate(state), error: null });
    } catch (e) {
      const err = e instanceof CofounderError ? e : new CofounderError("upstream_error", String(e));
      if (err.code === "limit_reached") return setDraft(null); // the plans screen has opened
      setDraft({ busy: false, update: null, error: errorCopy(err.code) });
    }
  };

  return (
    <>
      <button className="btn-ghost" onClick={run}>
        {locked ? <Lock className="h-4 w-4" /> : <FileText className="h-4 w-4" />} Draft investor update
        {locked && <span className="rounded-full bg-abyss px-1.5 py-0.5 text-[10px] text-muted">Scale</span>}
      </button>
      <Modal open={!!draft} onClose={() => setDraft(null)} title="Investor update" wide>
        {draft?.busy && <p className="py-8 text-center text-sm text-muted animate-pulse">Pulling your numbers and writing the update…</p>}
        {draft?.error && <p className="text-sm text-flame">{draft.error}</p>}
        {draft?.update && (
          <div className="space-y-3">
            <div>
              <label htmlFor="iu-subject" className="mb-1.5 block text-xs font-medium text-muted">Subject</label>
              <input
                id="iu-subject"
                className="field"
                value={draft.update.subject}
                onChange={(e) => setDraft({ ...draft, update: { ...draft.update!, subject: e.target.value } })}
              />
            </div>
            <div>
              <label htmlFor="iu-body" className="mb-1.5 block text-xs font-medium text-muted">Update</label>
              <textarea
                id="iu-body"
                rows={14}
                className="field resize-y leading-relaxed"
                value={draft.update.body}
                onChange={(e) => setDraft({ ...draft, update: { ...draft.update!, body: e.target.value } })}
              />
            </div>
            <p className="text-xs text-muted">Written only from what&apos;s logged in STARTIT. Check every number before you send it.</p>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={run}>Rewrite</button>
              <CopyButton text={`${draft.update.subject}\n\n${draft.update.body}`} label="Copy update" />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
