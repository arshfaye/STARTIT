/**
 * Market research: real posts and reviews in, evidence out.
 *
 * Signals come from live search in the Next.js app (/api/research: Hacker News, App Store reviews,
 * Stack Exchange, Bluesky)
 * or from text the founder pastes (reviews, threads, comments from anywhere). The AI then
 * clusters them into pain themes with real quotes, willingness-to-pay signals and an
 * evidence-based kill score.
 */
import { announceLimit, authHeaders } from "./cloud";
import { askJson, CofounderError } from "./cofounder";
import { demoAnalysis, isDemoIdea } from "./demo";
import { today } from "./engine";
import type { IdeaInput, ResearchAnalysis, Signal, SignalSource } from "./types";

export const SOURCE_LABEL: Record<SignalSource, string> = { reddit: "Reddit", hn: "Hacker News", appstore: "App Store reviews", stackexchange: "Stack Exchange", bluesky: "Bluesky", pasted: "Pasted" };

/**
 * Live search needs the STARTIT server. Instead of guessing the environment, ask it: a page with
 * no server behind it (like the Claude preview) gets no valid answer, so the app falls back to pasting.
 * Resolves to which sources are ready, or null when there is no server.
 */
export type LiveSources = Partial<Record<Exclude<SignalSource, "pasted" | "reddit">, boolean>>;
let probe: Promise<LiveSources | null> | null = null;
export function probeLiveSearch(): Promise<LiveSources | null> {
  probe ??= serverProbe<{ ok?: boolean; sources?: LiveSources }>("/api/research").then((j) => (j?.ok ? (j.sources ?? {}) : null));
  return probe;
}

/** GET a STARTIT API route; null unless it answers with JSON. Never throws. */
export async function serverProbe<T>(path: string): Promise<T | null> {
  if (typeof window === "undefined" || !/^https?:$/.test(location.protocol)) return null;
  try {
    const r = await fetch(path, { method: "GET", headers: { accept: "application/json", ...(await authHeaders()) } });
    if (!r.ok || !(r.headers.get("content-type") ?? "").includes("application/json")) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export async function searchSignals(sources: SignalSource[], query: string, country: string, signal?: AbortSignal) {
  const res = await fetch("/api/research", {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ sources, query, country }),
    signal,
  });
  const body = (await res.json().catch(() => ({}))) as { signals?: Signal[]; errors?: Record<string, string>; error?: string; code?: string; kind?: string; limit?: number; plan?: string };
  if (body.code === "limit_reached") announceLimit({ kind: body.kind, limit: body.limit, plan: body.plan, message: body.error, suggest: (body as { suggest?: string }).suggest });
  if (res.status === 404) throw new Error("Live search isn't available here. Use Paste posts instead.");
  if (!res.ok) throw new Error(body.error || `Search failed (${res.status})`);
  return { signals: body.signals ?? [], errors: body.errors ?? {} };
}

/** Split pasted text into separate posts: blank lines, "---" or numbered items start a new one. */
export function pastedToSignals(text: string): Signal[] {
  const chunks = text
    .replace(/\r/g, "")
    .split(/\n\s*(?:-{3,}|={3,})\s*\n|\n\s*\n/)
    .map((c) => c.trim())
    .filter((c) => c.length >= 15);
  const stamp = Date.now().toString(36);
  return chunks.slice(0, 200).map((c, i) => {
    const url = c.match(/https?:\/\/\S+/)?.[0];
    const clean = c.replace(/https?:\/\/\S+/g, "").trim();
    const community = url?.match(/reddit\.com\/r\/([^/]+)/)?.[1];
    return {
      id: `p-${stamp}-${i}`,
      source: "pasted" as const,
      title: clean.split("\n")[0].slice(0, 100),
      text: clean.slice(0, 2000),
      url,
      community: community ? `r/${community}` : url ? new URL(url).hostname.replace(/^www\./, "") : undefined,
      date: today(),
    };
  });
}

export function suggestedQuery(idea: IdeaInput) {
  const words = `${idea.concept} ${idea.audience}`
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w));
  const counts = new Map<string, number>();
  words.forEach((w) => counts.set(w, (counts.get(w) ?? 0) + 1));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([w]) => w)
    .join(" ");
}
const STOP = new Set("that with from this your their they them have will into about which when what where there these those than then each every also just more most very such only other some over under small independent month monthly subscription per cuts automated first based".split(" "));

function buildPrompt(idea: IdeaInput, signals: Signal[], query: string, country: string, currency: string) {
  const posts = signals
    .slice(0, 60)
    .map((s, i) => `[${i + 1}] id=${s.id} · ${s.community ?? s.source}${s.rating != null ? ` · ${s.rating}★ review` : ""}${s.score != null ? ` · ${s.score} pts` : ""}${s.comments != null ? ` · ${s.comments} comments` : ""}\n${s.title}\n${s.text.slice(0, 700)}`)
    .join("\n\n");
  return `You are a skeptical market researcher. A founder wants hard evidence about whether people actually have the problem their startup solves. Analyse ONLY the posts below. Never invent quotes or facts that aren't in them.

STARTUP: ${idea.name}
CONCEPT: ${idea.concept}
TARGET CUSTOMER: ${idea.audience}
MARKET: ${country} (currency ${currency})
SEARCH: "${query}"

POSTS (${signals.length}):
${posts}

Return ONLY a JSON object with exactly this shape:
{
  "summary": "2-3 blunt sentences: is the pain real, who has it, how badly",
  "pains": [ { "theme": "short name of the pain", "count": <number of posts that mention it>, "severity": "high"|"medium"|"low",
               "quotes": [ { "text": "exact words copied from a post, under 30 words", "signalId": "<the id= of that post>" } ] } ],
  "willingnessToPay": ["concrete evidence people pay or would pay, with the post number"],
  "alternatives": ["tools or workarounds people say they use now"],
  "opportunity": "the most specific underserved angle these posts point to, or say there isn't one",
  "demand": "strong"|"moderate"|"weak",
  "killScore": <0-100, where 0 = clear painful demand for this exact idea and 100 = no evidence anyone needs it>
}
Rules: 3-6 pains, most-mentioned first, 1-3 quotes each. If posts are off-topic, say so in summary and score high. Irrelevant posts don't count.`;
}

export async function analyzeSignals(idea: IdeaInput, signals: Signal[], query: string, country: string, currency: string, abort?: AbortSignal): Promise<ResearchAnalysis> {
  let raw: Partial<ResearchAnalysis>;
  try {
    raw = await askJson<Partial<ResearchAnalysis>>(buildPrompt(idea, signals, query, country, currency), abort, "research");
  } catch (e) {
    const demo = e instanceof CofounderError && e.code === "not_configured" && isDemoIdea(idea) ? demoAnalysis(signals, query) : null;
    if (demo) return demo;
    throw e;
  }
  const ids = new Set(signals.map((s) => s.id));
  const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    at: new Date().toISOString(),
    query,
    signalCount: signals.length,
    sources: [...new Set(signals.map((s) => s.source))],
    summary: str(raw.summary, "No summary returned."),
    pains: arr(raw.pains)
      .slice(0, 6)
      .map((p: Record<string, unknown>) => ({
        theme: str(p.theme, "Unnamed pain"),
        count: Math.max(0, Math.round(Number(p.count) || 0)),
        severity: (["high", "medium", "low"].includes(p.severity as string) ? p.severity : "medium") as "high" | "medium" | "low",
        // Keep only quotes that point at a real post we sent.
        quotes: arr(p.quotes)
          .filter((q: Record<string, unknown>) => typeof q?.text === "string" && ids.has(q.signalId as string))
          .slice(0, 3)
          .map((q: Record<string, unknown>) => ({ text: String(q.text).slice(0, 300), signalId: String(q.signalId) })),
      })),
    willingnessToPay: arr(raw.willingnessToPay).map(String).slice(0, 6),
    alternatives: arr(raw.alternatives).map(String).slice(0, 8),
    opportunity: str(raw.opportunity),
    demand: (["strong", "moderate", "weak"].includes(raw.demand as string) ? raw.demand : "weak") as "strong" | "moderate" | "weak",
    killScore: Math.max(0, Math.min(100, Math.round(Number(raw.killScore) || 50))),
  };
}
