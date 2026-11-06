/** Kill criteria, decision day, the weekly partner report and AI plan rebuilds. */
import { askJson, buildDossier } from "./cofounder";
import { addDays, computeExecution, fmtDate, today } from "./engine";
import { money } from "./locale";
import { revenueTotals } from "./revenue";
import type { AppState, KillMetric, Phase } from "./types";

export const METRICS: { id: KillMetric; label: string; unit: "count" | "money" }[] = [
  { id: "paying_customers", label: "Paying customers", unit: "count" },
  { id: "mrr", label: "Monthly recurring revenue", unit: "money" },
  { id: "revenue", label: "Total revenue", unit: "money" },
  { id: "interviews", label: "Customer interviews", unit: "count" },
];

export function metricValue(state: AppState, m: KillMetric): number {
  const rt = revenueTotals(state.revenue, state.prefs.currency, today());
  switch (m) {
    case "paying_customers": {
      const fromRevenue = new Set(state.revenue.filter((r) => r.currency === state.prefs.currency).map((r) => r.customer.trim().toLowerCase())).size;
      return Math.max(state.leads.filter((l) => l.stage === "paid").length, fromRevenue);
    }
    case "mrr":
      return rt.mrr;
    case "revenue":
      return rt.total;
    case "interviews":
      return Math.max(state.interviews.length, state.checkIns.reduce((s, c) => s + c.interviews, 0));
  }
}

export const fmtMetric = (m: KillMetric, v: number) => (METRICS.find((x) => x.id === m)!.unit === "money" ? money(v) : String(v));

/** Decision day: the deadline has passed and no decision was made since the criteria were set. */
export function decisionDue(state: AppState) {
  const k = state.killCriteria;
  if (!k || today() < k.deadline) return false;
  return !state.decisions.some((d) => d.at >= k.setAt);
}

export function weeklyReport(state: AppState): string {
  const now = today();
  const exec = computeExecution(state.tasks, state.checkIns, state.penalties, now);
  const rt = revenueTotals(state.revenue, state.prefs.currency, now);
  const weekAgo = addDays(now, -7);
  const shipped = state.tasks.filter((t) => t.done && t.doneAt && t.doneAt >= weekAgo);
  const overdue = state.tasks.filter((t) => !t.done && t.due < now);
  const k = state.killCriteria;
  const lines = [
    `${state.profile?.name ?? "Founder"} · ${state.idea.name} · week ending ${fmtDate(now)}`,
    ``,
    `Grade: ${exec.grade} (${exec.score}/1000)`,
    `Revenue: ${money(rt.total)} total · ${money(rt.mrr)} MRR · ${rt.customers30} paying in the last 30 days`,
    `Shipped this week: ${shipped.length ? shipped.map((t) => t.title).join("; ") : "nothing"}`,
    `Overdue: ${overdue.length ? overdue.map((t) => t.title).join("; ") : "none"}`,
    `Penalties so far: ${state.penalties.length}`,
  ];
  if (k) lines.push(`Kill criteria: ${fmtMetric(k.metric, metricValue(state, k.metric))} of ${fmtMetric(k.metric, k.target)} ${METRICS.find((x) => x.id === k.metric)!.label.toLowerCase()} by ${fmtDate(k.deadline)}`);
  if (state.notify.pledge) lines.push(``, `My pledge: ${state.notify.pledge}`);
  lines.push(``, `If these numbers look like excuses, call me out.`);
  return lines.join("\n");
}

export interface PlanSuggestion {
  title: string;
  phase: Phase;
  dueInDays: number;
  tech: boolean;
  why: string;
}

export async function rebuildPlan(state: AppState, signal?: AbortSignal): Promise<PlanSuggestion[]> {
  const prompt = `You are a blunt startup co-founder rebuilding the founder's plan for the next 2 weeks based on what actually happened.

${buildDossier(state)}

Propose 4-6 NEW tasks (don't repeat open tasks). Prioritise whatever is blocking revenue: selling, customer conversations and fixing the biggest pipeline leak come before building. Each task must be specific, finishable within its deadline, and measurable.

Return ONLY JSON: {"tasks":[{"title":"verb-first, specific, measurable","phase":"Validation"|"MVP Build"|"Early-Adopter Launch"|"Growth","dueInDays":<1-14>,"tech":<true if it needs code>,"why":"one sentence tied to their numbers"}]}`;
  const raw = await askJson<{ tasks?: Partial<PlanSuggestion>[] }>(prompt, signal, "plan");
  const phases: Phase[] = ["Validation", "MVP Build", "Early-Adopter Launch", "Growth"];
  return (raw.tasks ?? [])
    .filter((t) => typeof t.title === "string" && t.title.trim())
    .slice(0, 6)
    .map((t) => ({
      title: String(t.title).slice(0, 140),
      phase: phases.includes(t.phase as Phase) ? (t.phase as Phase) : "Growth",
      dueInDays: Math.min(14, Math.max(1, Math.round(Number(t.dueInDays) || 7))),
      tech: !!t.tech,
      why: String(t.why ?? "").slice(0, 200),
    }));
}

export interface InvestorUpdate {
  subject: string;
  body: string;
}

/** Scale: a monthly investor update drafted only from what's logged in STARTIT. */
export async function draftInvestorUpdate(state: AppState, signal?: AbortSignal): Promise<InvestorUpdate> {
  const prompt = `Write a monthly investor update for this startup, using ONLY the facts in the dossier. Never invent numbers, customers or wins.

${buildDossier(state)}

Format the body as plain text with these sections, each 1–4 short lines:
Highlights / Key numbers (revenue, MRR, paying customers, pipeline) / What we shipped / What didn't go to plan (be honest: missed deadlines, penalties, weak signals) / Next month's focus / Asks (specific intros or help).
Tone: confident, direct, no hype. Investors trust founders who report misses. Use the founder's currency.

Return ONLY JSON: {"subject": "<Startup> update: <Month Year> — <one-line headline>", "body": "<the update>"}`;
  const raw = await askJson<Partial<InvestorUpdate>>(prompt, signal, "update");
  return { subject: String(raw.subject ?? `${state.idea.name} update`).slice(0, 200), body: String(raw.body ?? "").slice(0, 6000) };
}
