"use client";

import { ClipboardPaste, ExternalLink, Search, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CofounderError, errorCopy } from "@/lib/cofounder";
import { fmtDate } from "@/lib/engine";
import { countryByCode } from "@/lib/locale";
import { analyzeSignals, pastedToSignals, probeLiveSearch, searchSignals, SOURCE_LABEL, suggestedQuery, type LiveSources } from "@/lib/research";
import { demoPosts, isDemoWorkspace } from "@/lib/demo";
import { useStore } from "@/lib/store";
import type { Signal, SignalSource } from "@/lib/types";
import { Badge, Card, CardHeader, KillGauge, cx } from "../ui";

const LIVE: { id: Exclude<SignalSource, "pasted" | "reddit">; hint: string }[] = [
  { id: "hn", hint: "Founders and builders. No setup." },
  { id: "appstore", hint: "Your competitors' reviews in your country. No setup." },
  { id: "stackexchange", hint: "“What tool does X?” questions. No setup." },
  { id: "bluesky", hint: "Needs a free Bluesky login on the server." },
];

export function Research() {
  const { state, dispatch } = useStore();
  // undefined = still checking, null = no server here, object = which sources are ready
  const [live, setLive] = useState<LiveSources | null | undefined>(undefined);
  const [mode, setMode] = useState<"search" | "paste">("paste");
  useEffect(() => {
    let alive = true;
    probeLiveSearch().then((s) => {
      if (!alive) return;
      setLive(s);
      if (s) {
        setMode("search");
        setSources((cur) => cur.filter((x) => s[x] !== false));
      }
    });
    return () => {
      alive = false;
    };
  }, []);
  const [query, setQuery] = useState(() => state.research?.query || suggestedQuery(state.idea));
  const [sources, setSources] = useState<Exclude<SignalSource, "pasted" | "reddit">[]>(["hn", "appstore", "stackexchange"]);
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState<"search" | "analyze" | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const ctl = useRef<AbortController | null>(null);

  const selected = useMemo(() => state.signals.filter((s) => !excluded.has(s.id)), [state.signals, excluded]);
  const byId = useMemo(() => new Map(state.signals.map((s) => [s.id, s])), [state.signals]);
  const a = state.research;
  const pasteCount = useMemo(() => pastedToSignals(paste).length, [paste]);

  const runSearch = async () => {
    if (!query.trim()) return setErrors(["Type what people would complain about, e.g. “dental no-shows”."]);
    setBusy("search");
    setErrors([]);
    try {
      const { signals, errors: errs } = await searchSignals(sources, query.trim(), state.prefs.country);
      dispatch({ type: "SIGNALS_ADD", signals });
      setErrors(Object.entries(errs).map(([s, m]) => `${SOURCE_LABEL[s as SignalSource]}: ${m}`));
      if (!signals.length && !Object.keys(errs).length) setErrors(["No posts found. Try plainer words, the way a frustrated customer would write them."]);
    } catch (e) {
      setErrors([(e as Error).message]);
    } finally {
      setBusy(null);
    }
  };

  const runAnalysis = async () => {
    if (selected.length < 3) return setErrors(["Collect at least 3 posts to analyse."]);
    setBusy("analyze");
    setErrors([]);
    const c = new AbortController();
    ctl.current = c;
    try {
      const country = countryByCode(state.prefs.country)?.name ?? state.prefs.country;
      const result = await analyzeSignals(state.idea, selected, query || "pasted posts", country, state.prefs.currency, c.signal);
      dispatch({ type: "RESEARCH_SET", research: result });
    } catch (e) {
      const err = e instanceof CofounderError ? e : new CofounderError("upstream_error", String(e));
      if (err.code !== "cancelled") setErrors([errorCopy(err.code)]);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* Collect */}
        <div className="grid min-w-0 content-start gap-5">
          <Card>
            <CardHeader title="Collect real posts" eyebrow="What customers say when you're not in the room" />
            <div role="tablist" aria-label="How to collect" className="mb-4 grid grid-cols-2 gap-1 rounded-lg border border-line bg-abyss p-1">
              {(
                [
                  ["search", "Search live"],
                  ["paste", "Paste posts"],
                ] as const
              ).map(([m, l]) => (
                <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={cx("rounded-md py-1.5 text-sm transition", mode === m ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-ink")}>
                  {l}
                </button>
              ))}
            </div>

            {mode === "search" ? (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void runSearch();
                }}
              >
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <label htmlFor="rs-query" className="sr-only">Search</label>
                  <input id="rs-query" className="field pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. dental appointment no-shows" />
                </div>
                <div className="flex flex-wrap gap-2">
                  {LIVE.map(({ id: s, hint }) => {
                    const on = sources.includes(s);
                    const ready = !live || live[s] !== false;
                    return (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={on}
                        disabled={!ready}
                        title={ready ? hint : `${SOURCE_LABEL[s]} isn't set up on the server yet.`}
                        onClick={() => setSources(on ? sources.filter((x) => x !== s) : [...sources, s])}
                        className={cx("rounded-full border px-3 py-1 text-xs transition disabled:cursor-not-allowed disabled:opacity-40", on ? "border-ink bg-ink text-obsidian" : "border-line text-muted hover:text-ink")}
                      >
                        {SOURCE_LABEL[s]}
                        {!ready && " · not set up"}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted">All free. Hacker News, App Store reviews and Stack Exchange work with no setup.</p>
                {live === undefined ? (
                  <p className="py-2 text-center text-sm text-muted">Checking for live search…</p>
                ) : live ? (
                  <button type="submit" className="btn-primary w-full" disabled={busy !== null || !sources.length}>
                    {busy === "search" ? "Searching…" : "Search"}
                  </button>
                ) : (
                  <div className="rounded-lg border border-line bg-abyss p-3 text-sm leading-relaxed text-muted">
                    Live search runs in the full STARTIT app, which talks to Hacker News, the App Store, Stack Exchange and Bluesky from its server. Here, use <b className="text-ink">Paste posts</b>: copy threads, comments or reviews from anywhere and they get the same analysis.
                  </div>
                )}
                <p className="text-xs text-muted">Search the way a frustrated customer writes, not the way you pitch.</p>
              </form>
            ) : (
              <div className="space-y-3">
                <label htmlFor="rs-paste" className="sr-only">Paste posts</label>
                <textarea
                  id="rs-paste"
                  rows={8}
                  className="field resize-y font-normal"
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  placeholder={"Paste Reddit threads, App Store or Play Store reviews, G2 reviews, forum posts, support emails…\n\nLeave a blank line between posts. Include the link if you have it."}
                />
                <button
                  className="btn-primary w-full"
                  disabled={!pasteCount}
                  onClick={() => {
                    dispatch({ type: "SIGNALS_ADD", signals: pastedToSignals(paste) });
                    setPaste("");
                  }}
                >
                  <ClipboardPaste className="h-4 w-4" /> Add {pasteCount || ""} post{pasteCount === 1 ? "" : "s"}
                </button>
                {isDemoWorkspace(state) && !state.signals.some((s) => s.id.startsWith("demo-")) && (
                  <button className="btn-ghost w-full" onClick={() => dispatch({ type: "SIGNALS_ADD", signals: demoPosts() })}>
                    <Sparkles className="h-4 w-4" /> Load 8 example posts for ClinicQ
                  </button>
                )}
              </div>
            )}
            {errors.length > 0 && (
              <div className="mt-3 space-y-1">
                {errors.map((e) => (
                  <p key={e} className="text-sm text-flame">{e}</p>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title={`${state.signals.length} post${state.signals.length === 1 ? "" : "s"} collected`}
              eyebrow={state.signals.length ? `${selected.length} selected for analysis` : "Nothing yet"}
              action={
                state.signals.length > 0 && (
                  <button className="text-xs text-muted hover:text-flame" onClick={() => dispatch({ type: "SIGNALS_CLEAR" })}>
                    Clear all
                  </button>
                )
              }
            />
            {state.signals.length > 0 && (
              <>
                <ul className="-mx-2 max-h-[420px] divide-y divide-line overflow-y-auto">
                  {state.signals.map((s) => {
                    const on = !excluded.has(s.id);
                    return (
                      <li key={s.id} className="flex gap-3 px-2 py-2.5">
                        <input
                          type="checkbox"
                          aria-label={`Include "${s.title}"`}
                          checked={on}
                          onChange={() => {
                            const n = new Set(excluded);
                            if (on) n.add(s.id);
                            else n.delete(s.id);
                            setExcluded(n);
                          }}
                          className="mt-1 accent-current"
                        />
                        <div className="min-w-0 flex-1">
                          <p className={cx("line-clamp-2 text-sm", !on && "text-muted")}>{s.title}</p>
                          <p className="mt-0.5 truncate text-xs text-muted">
                            {s.community ?? SOURCE_LABEL[s.source]}
                            {s.rating != null && ` · ${s.rating}★`}
                            {s.score != null && ` · ${s.score} pts`}
                            {s.comments != null && ` · ${s.comments} comments`}
                            {s.date && ` · ${fmtDate(s.date)}`}
                          </p>
                        </div>
                        {s.url && (
                          <a href={s.url} target="_blank" rel="noreferrer" aria-label="Open original" className="shrink-0 p-1 text-muted hover:text-ink">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                        <button aria-label="Remove post" onClick={() => dispatch({ type: "SIGNALS_REMOVE", ids: [s.id] })} className="shrink-0 p-1 text-muted hover:text-flame">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-4 flex gap-2">
                  <button className="btn-primary flex-1" disabled={busy !== null || selected.length < 3} onClick={runAnalysis}>
                    <Sparkles className="h-4 w-4" /> {busy === "analyze" ? "Analysing…" : `Analyse ${selected.length} posts`}
                  </button>
                  {busy === "analyze" && (
                    <button className="btn-ghost" onClick={() => ctl.current?.abort()}>
                      Stop
                    </button>
                  )}
                </div>
              </>
            )}
          </Card>
        </div>

        {/* Evidence */}
        <div className="min-w-0">
          {!a ? (
            <Card className="text-center">
              <div className="py-10">
                <p className="font-medium">No evidence yet</p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
                  Collect posts where your customers describe the problem, then analyse them. You&apos;ll get the real pains, exact quotes and an evidence-based kill score.
                </p>
              </div>
            </Card>
          ) : (
            <div className="space-y-5">
              <Card>
                <div className="grid items-center gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
                  <div>
                    <p className="eyebrow mb-1 text-center">Evidence-based kill score</p>
                    <KillGauge value={a.killScore} />
                  </div>
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap gap-2">
                      <Badge tone={a.demand === "strong" ? "emerald" : a.demand === "moderate" ? "amber" : "flame"} dot>
                        {a.demand[0].toUpperCase() + a.demand.slice(1)} demand
                      </Badge>
                      <Badge>
                        {a.signalCount} posts · {a.sources.map((s) => SOURCE_LABEL[s]).join(", ")}
                      </Badge>
                    </div>
                    <p className="text-[15px] leading-relaxed">{a.summary}</p>
                    <p className="mt-2 text-xs text-muted">
                      “{a.query}” · {fmtDate(a.at.slice(0, 10))} · Your Idea Audit now uses this evidence.
                    </p>
                  </div>
                </div>
              </Card>

              <Card>
                <CardHeader title="What people actually complain about" eyebrow="Ranked by how many posts mention it" />
                <ol className="space-y-5">
                  {a.pains.map((p) => (
                    <li key={p.theme}>
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="font-medium">{p.theme}</p>
                        <span className={cx("tnum shrink-0 text-xs", p.severity === "high" ? "text-flame" : p.severity === "medium" ? "text-amber" : "text-muted")}>
                          {p.count} post{p.count === 1 ? "" : "s"} · {p.severity}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line/70">
                        <div className="h-full rounded-full bg-ink" style={{ width: `${Math.min(100, (p.count / Math.max(1, a.signalCount)) * 100)}%` }} />
                      </div>
                      {p.quotes.map((q) => {
                        const s = byId.get(q.signalId);
                        return (
                          <blockquote key={q.signalId + q.text.slice(0, 10)} className="mt-2.5 border-l-2 border-line pl-3 text-sm text-muted">
                            “{excerpt(q.text)}”
                            {s && <Credit s={s} />}
                          </blockquote>
                        );
                      })}
                    </li>
                  ))}
                </ol>
                <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
                  Quotes are short excerpts from public posts, credited to their authors and linked to the original. Stack Exchange content is licensed under{" "}
                  <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer" className="underline underline-offset-2">CC BY-SA 4.0</a>. STARTIT doesn&apos;t
                  claim ownership of anything quoted here.
                </p>
              </Card>

              <div className="grid gap-5 md:grid-cols-2">
                <Card>
                  <CardHeader title="Will they pay?" />
                  {a.willingnessToPay.length ? (
                    <ul className="list-disc space-y-1.5 pl-4 text-sm marker:text-muted">{a.willingnessToPay.map((w) => <li key={w}>{w}</li>)}</ul>
                  ) : (
                    <p className="text-sm text-flame">No evidence anyone pays for this. That&apos;s the first thing to prove.</p>
                  )}
                </Card>
                <Card>
                  <CardHeader title="What they use today" />
                  {a.alternatives.length ? (
                    <div className="flex flex-wrap gap-1.5">{a.alternatives.map((w) => <Badge key={w}>{w}</Badge>)}</div>
                  ) : (
                    <p className="text-sm text-muted">No alternatives mentioned.</p>
                  )}
                </Card>
              </div>

              <Card>
                <CardHeader title="The opening" />
                <p className="text-[15px] leading-relaxed">{a.opportunity || "No clear opening in these posts."}</p>
                <button
                  className="btn-ghost mt-4 text-sm"
                  onClick={() => dispatch({ type: "ASK_COFOUNDER", prompt: "Read my market research. Based on that evidence, what exactly should I change about my idea, and what do I do this week?" })}
                >
                  Ask the co-founder what to do with this
                </button>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Keep quotes to a short excerpt: enough to show the pain, never a copy of someone's whole post. */
function excerpt(text: string, max = 280) {
  const t = text.trim();
  return t.length <= max ? t : t.slice(0, t.lastIndexOf(" ", max - 1) > 0 ? t.lastIndexOf(" ", max - 1) : max) + "…";
}

/** "— author · where · date", linked to the original post. */
function Credit({ s }: { s: Signal }) {
  const where = s.community ?? SOURCE_LABEL[s.source];
  const label = [s.author && s.source !== "appstore" ? s.author : null, where, s.date ? fmtDate(s.date) : null].filter(Boolean).join(" · ");
  return (
    <span className="mt-0.5 block text-xs">
      —{" "}
      {s.url ? (
        <a href={s.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:text-ink hover:underline">
          {label}
        </a>
      ) : (
        label
      )}
    </span>
  );
}
