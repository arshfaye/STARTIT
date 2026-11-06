"use client";

import { AlarmClock, CalendarCheck2, ClipboardCheck, Gavel, History, ShieldAlert, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { addDays, fmtDate, gradeFromScore, parse, scoreCheckIn, today } from "@/lib/engine";
import { currencySymbol, money } from "@/lib/locale";
import { revenueBetween } from "@/lib/revenue";
import { weeklyReport } from "@/lib/decisions";
import { KillCriteriaCard } from "../Decision";
import { useStore } from "@/lib/store";
import { Badge, Card, CardHeader, CopyButton, GradeBadge, Modal, ProgressBar, ScoreRing, cx } from "../ui";

function nextSunday(from: string) {
  const d = parse(from).getUTCDay();
  return addDays(from, d === 0 ? 0 : 7 - d);
}

export function Accountability() {
  const { state, dispatch, exec } = useStore();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const now = today();
  const overdue = state.tasks.filter((t) => !t.done && t.due < now);
  const sunday = nextSunday(now);
  const daysToSunday = Math.round((parse(sunday).getTime() - parse(now).getTime()) / 86_400_000);
  const nextWeek = (state.checkIns.reduce((m, c) => Math.max(m, c.week), 0) || 0) + 1;

  const verdict =
    exec.score >= 800
      ? "You're executing. Keep the cadence and don't add scope."
      : exec.score >= 600
        ? "Decent, not great. One more slipped week and you're a C-founder."
        : exec.score >= 480
          ? "You're busy, not productive. Cut the plan to what moves revenue."
          : "This is how startups die quietly. Ship one thing before Sunday.";

  const rows = [
    { label: "Tasks due to date, completed", value: `${exec.dueDone}/${exec.dueCount}`, pct: exec.dueRate * 100, pts: Math.round(exec.dueRate * 480), max: 480 },
    { label: "Whole roadmap completed", value: `${Math.round(exec.overallRate * 100)}%`, pct: exec.overallRate * 100, pts: Math.round(exec.overallRate * 170), max: 170 },
    { label: "Avg. weekly check-in score", value: `${Math.round(exec.checkInAvg)}`, pct: exec.checkInAvg / 10, pts: Math.round(exec.checkInAvg * 0.3), max: 300 },
    { label: "B-or-better streak", value: `${exec.streak} wk`, pct: (Math.min(exec.streak, 4) / 4) * 100, pts: Math.round(Math.min(exec.streak, 4) * 12.5), max: 50 },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* Report card */}
        <Card strong>
          <CardHeader eyebrow="Founder report card" title="This is how you're actually doing" icon={<ClipboardCheck className="h-4 w-4" />} />
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
            <div className="flex items-center gap-5">
              <div className="text-center">
                <GradeBadge grade={exec.grade} size="lg" />
                <p className="eyebrow mt-2">AI grade</p>
              </div>
              <ScoreRing value={exec.score} label="exec score" size={150} />
            </div>
            <div className="text-center sm:text-left">
              <p className="text-base font-medium leading-snug text-ink [text-wrap:balance]">“{verdict}”</p>
              <button
                className="btn-ghost mt-3 text-xs"
                onClick={() => dispatch({ type: "ASK_COFOUNDER", prompt: "Grade my execution honestly and give me my orders for the rest of this week." })}
              >
                Get my orders from the co-founder
              </button>
            </div>
          </div>
          <div className="mt-6 space-y-3.5">
            {rows.map((r) => (
              <div key={r.label}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
                  <span className="text-muted">{r.label}</span>
                  <span className="tnum text-ink">
                    {r.value} <span className="text-muted">· +{r.pts}/{r.max}</span>
                  </span>
                </div>
                <ProgressBar value={r.pct} className="h-1.5" />
              </div>
            ))}
            {exec.penaltyHit > 0 && (
              <div className="flex items-baseline justify-between gap-3 rounded-lg border border-line bg-abyss px-3 py-2 text-xs">
                <span className="inline-flex items-center gap-1.5 text-flame">
                  <TrendingDown className="h-3.5 w-3.5" /> Missed-deadline penalties
                </span>
                <span className="tnum text-flame">−{exec.penaltyHit}</span>
              </div>
            )}
          </div>
        </Card>

        <div className="grid min-w-0 gap-5">
          {/* Check-in CTA */}
          <Card>
            <CardHeader
              eyebrow="Weekly check-in"
              title={daysToSunday === 0 ? "Check-in is due today" : `Due Sunday, ${fmtDate(sunday)}`}
              icon={<CalendarCheck2 className="h-4 w-4" />}
              action={
                <Badge tone={daysToSunday <= 1 ? "amber" : "cyber"} glow={daysToSunday <= 1}>
                  <AlarmClock className="h-3.5 w-3.5" /> {daysToSunday === 0 ? "Today" : `${daysToSunday}d left`}
                </Badge>
              }
            />
            <p className="text-sm leading-relaxed text-muted">
              Report what shipped, what didn&apos;t, and the numbers. Skipping a week counts as an F.
            </p>
            <button className="btn-primary mt-4 w-full" onClick={() => setOpen(true)}>
              Submit week {nextWeek} check-in
            </button>
          </Card>

          {/* Penalty */}
          <Card className={overdue.length ? "border-flame/40" : ""}>
            <CardHeader
              eyebrow="Penalty mechanism"
              title={overdue.length ? `${overdue.length} deadline${overdue.length > 1 ? "s" : ""} missed` : "No missed deadlines"}
              icon={<Gavel className={cx("h-4 w-4", overdue.length ? "text-flame" : "text-emerald")} />}
            />
            {overdue.length ? (
              <>
                <ul className="mb-4 space-y-2">
                  {overdue.map((t) => (
                    <li key={t.id} className="flex items-start justify-between gap-3 rounded-lg border border-line bg-abyss px-3 py-2 text-sm">
                      <span className="min-w-0">{t.title}</span>
                      <span className="tnum shrink-0 text-[11px] text-flame">due {fmtDate(t.due)}</span>
                    </li>
                  ))}
                </ul>
                {!confirming ? (
                  <button className="btn-danger w-full" onClick={() => setConfirming(true)}>
                    <ShieldAlert className="h-4 w-4" /> Trigger missed deadline
                  </button>
                ) : (
                  <div className="rounded-lg border border-line bg-abyss p-3">
                    <p className="text-sm text-ink">
                      Push {overdue.length} task{overdue.length > 1 ? "s" : ""} back 14 days, flag {overdue.length > 1 ? "them" : "it"} delayed and deduct{" "}
                      {overdue.length * 35} points?
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        className="btn-danger flex-1"
                        onClick={() => {
                          dispatch({ type: "MISSED_DEADLINE" });
                          setConfirming(false);
                        }}
                      >
                        Apply penalty
                      </button>
                      <button className="btn-ghost" onClick={() => setConfirming(false)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted">Every task that&apos;s due is shipped. The moment one slips, it shows up here and costs you 35 points.</p>
            )}
          </Card>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <KillCriteriaCard />
        <PartnerCard />
      </div>

      {/* History */}
      <Card>
        <CardHeader eyebrow="Ledger" title="Check-in history & penalty log" icon={<History className="h-4 w-4" />} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[11px] text-muted">
                <th className="py-2 pr-3 font-medium">Week</th>
                <th className="py-2 pr-3 font-medium">Grade</th>
                <th className="py-2 pr-3 font-medium">Goals</th>
                <th className="py-2 pr-3 font-medium">Interviews</th>
                <th className="py-2 pr-3 font-medium">Signups</th>
                <th className="py-2 pr-3 font-medium">Revenue</th>
                <th className="py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="tnum">
              {[...state.checkIns].reverse().map((c) => (
                <tr key={c.id} className="border-b border-line/50 align-top last:border-0">
                  <td className="py-3 pr-3 text-muted">
                    W{c.week}
                    <div className="text-[10px]">{fmtDate(c.submittedAt)}</div>
                  </td>
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-2">
                      <GradeBadge grade={c.grade} size="sm" />
                      <span className="text-xs text-muted">{c.score}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-3">
                    {c.goalsHit}/{c.goalsSet}
                  </td>
                  <td className="py-3 pr-3">{c.interviews}</td>
                  <td className="py-3 pr-3">{c.signups}</td>
                  <td className="py-3 pr-3">{money(c.revenue)}</td>
                  <td className="max-w-[320px] py-3 text-xs leading-relaxed text-muted">{c.progress}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {state.penalties.length > 0 && (
          <div className="mt-5 space-y-2 border-t border-line pt-4">
            {state.penalties.map((p) => (
              <p key={p.id} className="flex items-center gap-2 text-xs text-flame">
                <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                {fmtDate(p.at)} ·{" "}
                {p.reason === "deleted"
                  ? "deleted while overdue"
                  : `${p.taskIds.length} task${p.taskIds.length > 1 ? "s" : ""} pushed +${p.days}d`}{" "}
                · {(p.titles ?? p.taskIds.map((id) => state.tasks.find((t) => t.id === id)?.title ?? "task")).join(", ")}
              </p>
            ))}
          </div>
        )}
      </Card>

      <CheckInModal open={open} onClose={() => setOpen(false)} week={nextWeek} />
    </div>
  );
}

function CheckInModal({ open, onClose, week }: { open: boolean; onClose: () => void; week: number }) {
  const { state, dispatch } = useStore();
  const last = state.checkIns[state.checkIns.length - 1];
  const since = last ? addDays(last.submittedAt, 1) : state.startDate;
  const logged = revenueBetween(state.revenue, state.prefs.currency, since, today());
  const loggedInterviews = state.interviews.filter((i) => i.date >= since).length;
  const [f, setF] = useState({ progress: "", goalsSet: 4, goalsHit: 3, interviews: loggedInterviews, signups: 12, revenue: logged });
  // Revenue and interviews come from their logs; refresh them each time the form opens.
  useEffect(() => {
    if (open) setF((x) => ({ ...x, revenue: logged, interviews: loggedInterviews }));
  }, [open, logged, loggedInterviews]);
  const preview = scoreCheckIn(f);
  const grade = gradeFromScore(preview);
  const num = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: Math.max(0, Number(e.target.value) || 0) });

  return (
    <Modal open={open} onClose={onClose} title={`Week ${week} check-in`} wide>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!f.progress.trim()) {
            dispatch({ type: "TOAST", tone: "warn", text: "Write what actually shipped. One line is enough." });
            return;
          }
          dispatch({ type: "SUBMIT_CHECKIN", data: { ...f, goalsHit: Math.min(f.goalsHit, f.goalsSet) } });
          setF({ progress: "", goalsSet: 4, goalsHit: 3, interviews: 5, signups: 12, revenue: 0 });
          onClose();
        }}
      >
        <div>
          <label htmlFor="ci-progress" className="mb-1.5 block text-xs font-medium text-muted">What shipped this week? What didn&apos;t, and why?</label>
          <textarea
            id="ci-progress"
            rows={3}
            className="field resize-none"
            value={f.progress}
            onChange={(e) => setF({ ...f, progress: e.target.value })}
            placeholder="Shipped payments. Didn't onboard design partners because…"
          />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {(
            [
              ["goalsSet", "Goals set"],
              ["goalsHit", "Goals hit"],
              ["interviews", "Interviews"],
              ["signups", "Signups"],
              ["revenue", `Revenue (${currencySymbol()})`],
            ] as [keyof typeof f, string][]
          ).map(([k, l]) => (
            <div key={k}>
              <label htmlFor={`ci-${k}`} className="mb-1.5 block text-xs font-medium text-muted">{l}</label>
              <input id={`ci-${k}`} type="number" min={0} className="field tnum" value={f[k]} onChange={num(k)} />
              {k === "revenue" && (
                <p className="mt-1 text-[11px] leading-snug text-muted">{f.revenue > logged ? `${money(f.revenue - logged)} more than your log. We'll add it.` : "From your revenue log"}</p>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-4 rounded-xl border border-line bg-abyss p-4">
          <div className="flex items-center gap-3">
            <GradeBadge grade={grade} />
            <div>
              <p className="eyebrow">Projected grade</p>
              <p className="tnum text-lg">{preview}<span className="text-sm text-muted">/1000</span></p>
            </div>
          </div>
          <p className="hidden max-w-[220px] text-right text-xs text-muted sm:block">
            70% of the grade is goals hit vs. set. Interviews, signups and first revenue earn the rest.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary">
            <TrendingUp className="h-4 w-4" /> Submit & grade me
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PartnerCard() {
  const { state, dispatch } = useStore();
  const n = state.notify;
  const [f, setF] = useState({ partnerName: n.partnerName, partnerEmail: n.partnerEmail, pledge: n.pledge });
  const [editing, setEditing] = useState(!n.partnerName);
  const report = weeklyReport(state);

  if (editing) {
    return (
      <Card>
        <CardHeader title="Accountability partner" eyebrow="Someone who sees your grade every Sunday. Public commitment beats private intention." />
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            dispatch({ type: "NOTIFY_SET", notify: { ...n, ...f } });
            setEditing(false);
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="pt-name" className="mb-1.5 block text-xs font-medium text-muted">Their name</label>
              <input id="pt-name" className="field" value={f.partnerName} onChange={(e) => setF({ ...f, partnerName: e.target.value })} placeholder="A founder friend, mentor…" />
            </div>
            <div>
              <label htmlFor="pt-email" className="mb-1.5 block text-xs font-medium text-muted">Their email</label>
              <input id="pt-email" type="email" className="field" value={f.partnerEmail} onChange={(e) => setF({ ...f, partnerEmail: e.target.value })} />
            </div>
          </div>
          <div>
            <label htmlFor="pt-pledge" className="mb-1.5 block text-xs font-medium text-muted">Your pledge (what happens if you miss)</label>
            <input id="pt-pledge" className="field" value={f.pledge} onChange={(e) => setF({ ...f, pledge: e.target.value })} placeholder="If I miss 2 deadlines in a row, I buy them dinner." />
          </div>
          <button type="submit" className="btn-primary" disabled={!f.partnerName.trim()}>Save partner</button>
        </form>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader
        title={`Partner: ${n.partnerName}`}
        eyebrow={n.partnerEmail ? `Send it to ${n.partnerEmail} every Sunday, from your own email` : "Send them this report every Sunday"}
        action={
          <button className="text-xs text-muted hover:text-ink" onClick={() => setEditing(true)}>Edit</button>
        }
      />
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-abyss p-3 text-xs leading-relaxed text-ink/90">{report}</pre>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <CopyButton text={report} label="Copy this week's report" />
        {n.partnerEmail && (
          <a
            className="btn-primary"
            href={`mailto:${encodeURIComponent(n.partnerEmail)}?subject=${encodeURIComponent(`My week on ${state.idea.name}`)}&body=${encodeURIComponent(report)}`}
          >
            Email it
          </a>
        )}
      </div>
      <p className="mt-2 text-xs text-muted">Your workspace is end-to-end encrypted, so STARTIT can&apos;t send this for you. It opens in your own email app instead.</p>
    </Card>
  );
}
