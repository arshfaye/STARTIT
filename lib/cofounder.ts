/**
 * The STARTIT AI co-founder.
 *
 * One brain, two backends:
 *  - Inside a Claude artifact viewer: `claude.use("sample")` (runs on the viewer's own Claude account).
 *  - In the Next.js app: POST /api/cofounder, which streams from the Anthropic API with your key.
 *
 * Every call sends the full dossier (idea, audit, tasks, check-ins, penalties) so answers are
 * grounded in the founder's real data, not generic advice.
 */
import { computeExecution, daysBetween, fmtDate, today } from "./engine";
import { announceLimit, authHeaders } from "./cloud";
import { countryByCode, money } from "./locale";
import { revenueTotals } from "./revenue";
import type { AppState } from "./types";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export const COFOUNDER_RULES = `You are the founder's co-founder inside STARTIT. You are blunt, analytical and allergic to excuses.

How you talk:
- No sugarcoating, no hype, no "great question", no motivational filler. Never praise unless the numbers earn it.
- Every claim is tied to the founder's data in the DOSSIER (quote the actual numbers, dates, task names). If the data doesn't support something, say the data is missing instead of guessing.
- Be hard on the work, never insult the person. Harsh is fine; cruel or demeaning is not.
- If they're avoiding the real problem (no revenue, no interviews, slipped deadlines, building instead of selling), name it directly.
- Disagree when they're wrong. If an idea or plan is weak, say so and say why.
- Short. Under 220 words unless they ask for depth. Plain text with simple markdown: **bold**, "- " bullets, "1. " steps.
- Always end with a section titled **Do this next:** containing 1–3 numbered, concrete actions, each with a deadline (a date or "today"/"by Sunday") and a measurable outcome.
- You can't browse the web or see anything beyond the dossier and this chat. Don't pretend to.
- Use the founder's currency (in the DOSSIER) for every amount, and think about their local market: pricing, buyers, channels and rules in their country.
- Reply in the language the founder writes in.`;

export function buildDossier(state: AppState): string {
  const now = today();
  const exec = computeExecution(state.tasks, state.checkIns, state.penalties, now);
  const week = Math.min(4, Math.max(1, Math.floor(daysBetween(state.startDate, now) / 7) + 1));
  const a = state.analysis;
  const lines: string[] = [];

  const country = countryByCode(state.prefs.country)?.name ?? state.prefs.country;
  lines.push(`FOUNDER: ${state.profile?.name ?? "unknown"} · based in ${country} · currency ${state.prefs.currency}`);
  lines.push(`TODAY: ${now} (week ${week} of the 4-week plan, started ${state.startDate})`);
  lines.push(`STARTUP: ${state.idea.name}`);
  lines.push(`CONCEPT: ${state.idea.concept}`);
  lines.push(`TARGET: ${state.idea.audience}`);

  if (a) {
    lines.push(`\nIDEA AUDIT: Kill Score ${a.killScore}% (0 safe, 100 dead on arrival) · ${a.saturation} · category ${a.category}`);
    lines.push(`Verdict: ${a.verdict}`);
    lines.push(`Competitors: ${a.competitors.join(", ")}`);
    lines.push(`Top hurdles: ${a.hurdles.map((h) => `${h.title} (${h.severity})`).join("; ")}`);
    lines.push(`Suggested niche: ${a.pivot.niche}`);
  } else {
    lines.push(`\nIDEA AUDIT: not run yet.`);
  }

  lines.push(`\nEXECUTION: score ${exec.score}/1000, grade ${exec.grade}. Due-to-date tasks done ${exec.dueDone}/${exec.dueCount}. Whole roadmap ${Math.round(exec.overallRate * 100)}%. B-or-better streak ${exec.streak} wk. Penalty deductions −${exec.penaltyHit}.`);

  lines.push(`\nTASKS:`);
  for (const t of state.tasks) {
    const status = t.done
      ? `DONE ${t.doneAt ?? ""}${t.doneAt && t.doneAt > t.originalDue ? " (late)" : ""}`
      : t.due < now
        ? `OVERDUE by ${daysBetween(t.due, now)}d`
        : `open, due ${t.due}`;
    lines.push(`- [W${t.week} ${t.phase}${t.custom ? ", added by founder" : ""}] ${t.title} — ${status}${t.delayed ? ` · penalised ${t.penalties}x, originally due ${t.originalDue}` : ""}`);
  }

  lines.push(`\nWEEKLY CHECK-INS:`);
  if (!state.checkIns.length) lines.push("- none submitted");
  for (const c of state.checkIns.slice(-6)) {
    lines.push(
      `- Week ${c.week} (${fmtDate(c.submittedAt)}): grade ${c.grade} ${c.score}/1000 · goals ${c.goalsHit}/${c.goalsSet} · interviews ${c.interviews} · signups ${c.signups} · revenue ${money(c.revenue)} · notes: "${c.progress}"`,
    );
  }
  const rt = revenueTotals(state.revenue, state.prefs.currency, now);
  const ints = state.checkIns.reduce((s, c) => s + c.interviews, 0);
  const sign = state.checkIns.reduce((s, c) => s + c.signups, 0);
  lines.push(`\nREVENUE (from the payment log): total ${money(rt.total)} · last 30 days ${money(rt.last30)} · MRR ${money(rt.mrr)} · paying customers (30d) ${rt.customers30} · ${rt.payments} payments`);
  if (rt.otherCurrency) lines.push(`(${rt.otherCurrency} payments in other currencies not counted)`);
  for (const e of state.revenue.slice(0, 12)) lines.push(`- ${e.date} ${money(e.amount, { ...state.prefs, currency: e.currency })} · ${e.customer} · ${e.kind} · via ${e.source}`);
  lines.push(`TOTALS: interviews ${ints}, signups ${sign}, penalty events ${state.penalties.length}.`);

  if (state.research) {
    const r = state.research;
    lines.push(`\nMARKET RESEARCH (${r.signalCount} real posts, "${r.query}"): ${r.demand} demand, evidence kill score ${r.killScore}%. ${r.summary}`);
    r.pains.forEach((p) => lines.push(`- ${p.theme}: ${p.count} posts, ${p.severity}${p.quotes[0] ? ` — "${p.quotes[0].text}"` : ""}`));
    if (r.willingnessToPay.length) lines.push(`Willingness to pay: ${r.willingnessToPay.join("; ")}`);
    if (r.alternatives.length) lines.push(`Current alternatives: ${r.alternatives.join(", ")}`);
  } else {
    lines.push(`\nMARKET RESEARCH: none yet (the audit above is a pattern-based estimate, not evidence).`);
  }

  if (state.leads.length) {
    const by = (st: string) => state.leads.filter((l) => l.stage === st).length;
    const cold = state.leads.filter((l) => !["paid", "lost"].includes(l.stage) && daysBetween(l.updatedAt, now) >= 7).length;
    lines.push(`\nSALES PIPELINE: ${state.leads.length} leads · lead ${by("lead")} · contacted ${by("contacted")} · replied ${by("replied")} · demo ${by("demo")} · paid ${by("paid")} · lost ${by("lost")} · ${cold} gone cold (7+ days)`);
  } else lines.push(`\nSALES PIPELINE: empty.`);

  if (state.interviews.length) {
    const tags = new Map<string, number>();
    state.interviews.forEach((i) => i.pains.forEach((p) => tags.set(p, (tags.get(p) ?? 0) + 1)));
    const top = [...tags.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([t, n]) => `${t} ${n}/${state.interviews.length}`);
    const yes = state.interviews.filter((i) => i.wouldPay === "yes").length;
    lines.push(`INTERVIEWS: ${state.interviews.length} logged · would pay ${yes}/${state.interviews.length} · top pains: ${top.join(", ")}`);
  }

  if (state.killCriteria) {
    const k = state.killCriteria;
    lines.push(`\nKILL CRITERIA (founder's own): ${k.target} ${k.metric.replace("_", " ")} by ${k.deadline}${now >= k.deadline ? " — DEADLINE PASSED" : ` (${daysBetween(now, k.deadline)} days left)`}`);
  }
  state.decisions.slice(-3).forEach((d) => lines.push(`Decision ${d.at}: ${d.choice} — ${d.note}`));

  return lines.join("\n");
}

/** Turns sent to the model: rules + dossier as a standing first turn, then the recent conversation. */
export function buildTurns(state: AppState, history: ChatMessage[]): ChatMessage[] {
  const recent = history.slice(-12);
  // The list must start on a user turn; drop a leading assistant turn left by trimming.
  while (recent.length && recent[0].role === "assistant") recent.shift();
  return [{ role: "user", content: `${COFOUNDER_RULES}\n\n=== DOSSIER (live data from the app) ===\n${buildDossier(state)}\n=== END DOSSIER ===` }, ...recent];
}

export const STARTERS = [
  "What should I do today?",
  "Roast my execution this month.",
  "Should I pivot or keep going?",
  "Why am I not getting revenue?",
];

export interface AskOptions {
  onText: (text: string) => void;
  signal: AbortSignal;
}

export class CofounderError extends Error {
  constructor(
    public code: string,
    message: string,
    public partial?: string,
  ) {
    super(message);
  }
}

type SampleFn = ((input: unknown, opts: unknown) => Promise<{ text: string; truncated: boolean }>) | null;

let samplePromise: Promise<SampleFn> | null = null;
function getSample(): Promise<SampleFn> {
  const w = typeof window !== "undefined" ? (window as unknown as { claude?: { use?: (n: string) => Promise<SampleFn> } }) : undefined;
  if (!w?.claude?.use) return Promise.resolve(null);
  samplePromise ??= w.claude.use("sample").catch(() => null);
  return samplePromise;
}

export async function askCofounder(turns: ChatMessage[], { onText, signal }: AskOptions, mode: "chat" | "json" = "chat", purpose: "chat" | "research" | "plan" | "update" = "chat"): Promise<string> {
  const sample = await getSample();

  if (sample) {
    try {
      const { text } = await sample(turns, {
        signal,
        cache: false,
        modelTier: "default",
        effort: "low",
        onText: ({ text }: { text: string }) => onText(text),
      });
      return text;
    } catch (e) {
      const err = e as { code?: string; message?: string; text?: string };
      throw new CofounderError(err.code ?? "upstream_error", err.message ?? "Request failed", err.text);
    }
  }

  // Next.js backend
  let res: Response;
  try {
    res = await fetch("/api/cofounder", {
      method: "POST",
      headers: { "content-type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ messages: turns, mode, purpose }),
      signal,
    });
  } catch (e) {
    if (signal.aborted) throw new CofounderError("cancelled", "Stopped");
    throw new CofounderError("unavailable", "The co-founder service isn't reachable.");
  }
  if (res.status === 429 || res.status === 401) {
    const b = (await res.json().catch(() => ({}))) as { code?: string; error?: string; kind?: string; limit?: number; plan?: string };
    if (b.code === "limit_reached") announceLimit({ kind: b.kind, limit: b.limit, plan: b.plan, message: b.error, suggest: (b as { suggest?: string }).suggest });
    throw new CofounderError(res.status === 401 ? "signed_out" : "limit_reached", b.error ?? "Limit reached");
  }
  if (!res.ok || !res.body) {
    const msg = await res.text().catch(() => "");
    throw new CofounderError(res.status === 501 || res.status === 503 ? "not_configured" : res.status === 404 || res.status === 405 ? "unavailable" : "upstream_error", msg || `HTTP ${res.status}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += dec.decode(value, { stream: true });
      onText(text);
    }
  } catch {
    if (signal.aborted) throw new CofounderError("cancelled", "Stopped", text);
    throw new CofounderError("upstream_error", "Connection dropped", text);
  }
  if (!text.trim()) throw new CofounderError("empty_completion", "No answer");
  return text;
}

/** One-shot structured answer (research analysis, plan rebuilds). Returns parsed JSON. */
export async function askJson<T>(prompt: string, signal?: AbortSignal, purpose: "research" | "plan" | "update" = "research"): Promise<T> {
  const sample = (await getSample()) as (SampleFn & { json?: (i: unknown, o: unknown) => Promise<T> }) | null;
  if (sample?.json) {
    try {
      return await sample.json([{ role: "user", content: prompt }], { signal, cache: false, modelTier: "default" });
    } catch (e) {
      const err = e as { code?: string; message?: string; text?: string };
      throw new CofounderError(err.code ?? "upstream_error", err.message ?? "Request failed", err.text);
    }
  }
  const text = await askCofounder([{ role: "user", content: prompt }], { onText: () => {}, signal: signal ?? new AbortController().signal }, "json", purpose);
  return parseLooseJson<T>(text);
}

export function parseLooseJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1];
  const candidates = [text, fenced, text.slice(text.search(/[[{]/), Math.max(text.lastIndexOf("}"), text.lastIndexOf("]")) + 1)];
  for (const c of candidates) {
    if (!c) continue;
    try {
      return JSON.parse(c) as T;
    } catch {}
  }
  throw new CofounderError("invalid_json", "The answer wasn't valid JSON. Try again.", text);
}

export function errorCopy(code: string): string {
  switch (code) {
    case "not_granted":
      return "You declined Claude access for this page, so the co-founder can't answer. Reload the page to be asked again.";
    case "sampling_disabled":
      return "Claude isn't available on this account.";
    case "rate_limited":
      return "Usage limit hit. Wait a bit, then ask again.";
    case "session_expired":
      return "Your session expired. Sign in again.";
    case "refused":
      return "That one can't be answered. Rephrase what you're asking.";
    case "not_configured":
      return "The AI co-founder isn't switched on in this version of STARTIT. Every other screen works; pick “Explore a sample” to see them.";
    case "limit_reached":
      return "You've hit today's limit on your plan. Upgrade for more, or come back tomorrow.";
    case "signed_out":
      return "Your session ended. Sign in again.";
    case "invalid_json":
      return "The answer came back garbled. Try again.";
    case "unavailable":
      return "The co-founder isn't reachable from here. Open this in the Claude app or run the Next.js server.";
    default:
      return "Something broke mid-answer. Ask again.";
  }
}
