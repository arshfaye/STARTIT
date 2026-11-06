"use client";

import { AlertTriangle, ArrowRight, Crosshair, Flame, Radar, Skull, Sparkles, Swords, Target } from "lucide-react";
import { useEffect, useState } from "react";
import { analyzeIdea, SCAN_STEPS } from "@/lib/engine";
import { sampleIdea, useStore } from "@/lib/store";
import type { IdeaInput, Saturation } from "@/lib/types";
import { Badge, Card, CardHeader, KillGauge, cx } from "../ui";

const SAT_TONE: Record<Saturation, "emerald" | "amber" | "flame"> = {
  "Open Niche": "emerald",
  Competitive: "amber",
  "Heavily Saturated": "flame",
};

export function IdeaAudit() {
  const { state, dispatch } = useStore();
  const [form, setForm] = useState<IdeaInput>(state.idea);
  const [scanning, setScanning] = useState(false);
  const [step, setStep] = useState(0);
  const a = state.analysis;
  const ev = state.research;

  useEffect(() => setForm(state.idea), [state.idea]);

  const run = () => {
    if (!form.name.trim() || !form.concept.trim() || !form.audience.trim()) {
      dispatch({ type: "TOAST", tone: "warn", text: "Fill in all three fields. Vague inputs get vague verdicts." });
      return;
    }
    setScanning(true);
    setStep(0);
    dispatch({ type: "SET_IDEA", idea: form });
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setStep(i);
      if (i >= SCAN_STEPS.length) {
        clearInterval(iv);
        dispatch({ type: "SET_ANALYSIS", analysis: analyzeIdea(form) });
        setScanning(false);
      }
    }, 520);
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
      {/* Input */}
      <Card className="h-fit xl:sticky xl:top-24">
        <CardHeader eyebrow="Step 01 · Input" title="Pitch it like you would to a skeptic" icon={<Crosshair className="h-4 w-4" />} />
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            run();
          }}
        >
          <div>
            <label htmlFor="idea-name" className="mb-1.5 block text-xs font-medium text-muted">Startup name</label>
            <input id="idea-name" className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. ClinicQ" />
          </div>
          <div>
            <label htmlFor="idea-concept" className="mb-1.5 block text-xs font-medium text-muted">Core concept</label>
            <textarea
              id="idea-concept"
              rows={4}
              className="field resize-none"
              value={form.concept}
              onChange={(e) => setForm({ ...form, concept: e.target.value })}
              placeholder="What it does, how it makes money"
            />
            <p className="mt-1.5 text-[11px] text-muted/80">Include the price. No price, no signal.</p>
          </div>
          <div>
            <label htmlFor="idea-audience" className="mb-1.5 block text-xs font-medium text-muted">Target audience</label>
            <input
              id="idea-audience"
              className="field"
              value={form.audience}
              onChange={(e) => setForm({ ...form, audience: e.target.value })}
              placeholder="Job title + context + location"
            />
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="submit" className="btn-primary flex-1" disabled={scanning}>
              <Radar className={cx("h-4 w-4", scanning && "animate-spin")} />
              {scanning ? "Auditing…" : "Run brutal audit"}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setForm({ name: "SnapTask", concept: "An AI-powered productivity platform for everyone.", audience: "Everyone" })}
              title="Load a deliberately weak pitch"
            >
              Try a weak pitch
            </button>
          </div>
          {form.name !== "ClinicQ" && (
            <button type="button" className="text-xs text-muted underline-offset-4 hover:text-ink hover:underline" onClick={() => setForm(sampleIdea(state.prefs))}>
              Restore sample (ClinicQ)
            </button>
          )}
        </form>
      </Card>

      {/* Results */}
      <div className="min-w-0 space-y-5">
        {scanning ? (
          <Card strong className="overflow-hidden">
            <CardHeader eyebrow="Scraping the internet" title={`Stress-testing ${form.name}`} icon={<Radar className="h-4 w-4" />} />
            <ol className="space-y-3">
              {SCAN_STEPS.map((s, i) => (
                <li key={s} className="flex items-center gap-3 text-sm">
                  <span
                    className={cx(
                      "grid h-6 w-6 place-items-center rounded-full border text-[10px]",
                      i < step ? "border-ink bg-ink text-obsidian" : i === step ? "border-ink text-ink" : "border-line text-muted",
                    )}
                  >
                    {i < step ? "✓" : i + 1}
                  </span>
                  <span className={i <= step ? "text-ink" : "text-muted"}>{s}</span>
                </li>
              ))}
            </ol>
            <div className="relative mt-6 h-1 overflow-hidden rounded-full bg-abyss">
              <div className="absolute inset-y-0 w-1/3 animate-scan " />
            </div>
          </Card>
        ) : a ? (
          <>
            <Card strong className="animate-rise">
              <div className="grid items-center gap-6 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
                <div>
                  <p className="eyebrow mb-2 text-center">Kill Score</p>
                  <KillGauge value={ev ? ev.killScore : a.killScore} />
                  <p className="mt-1 text-center text-xs text-muted">{ev ? `From ${ev.signalCount} real posts` : "Quick estimate, not live data"}</p>
                </div>
                <div className="min-w-0">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Badge tone={SAT_TONE[a.saturation]} glow>
                      {a.saturation === "Heavily Saturated" ? <Flame className="h-3.5 w-3.5" /> : a.saturation === "Competitive" ? <Swords className="h-3.5 w-3.5" /> : <Target className="h-3.5 w-3.5" />}
                      {a.saturation}
                    </Badge>
                    <Badge>Category · {a.category}</Badge>
                  </div>
                  <h2 className="text-lg font-semibold leading-snug tracking-tight [text-wrap:balance] sm:text-xl">{ev ? ev.summary : a.verdict}</h2>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {a.signals.slice(0, 4).map((s) => (
                      <div key={s.label} className="min-w-0 rounded-lg border border-line bg-abyss px-3 py-2">
                        <p className="truncate text-[10px] text-muted">{s.label}</p>
                        <p className="truncate text-sm font-medium">{s.value}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-xs text-muted">
                    You&apos;re up against: <span className="text-ink">{a.competitors.join(" · ")}</span>
                  </p>
                </div>
              </div>
            </Card>

            {ev ? (
              <Card className="animate-rise">
                <CardHeader
                  title="What real customers complain about"
                  eyebrow={`From ${ev.signalCount} posts · ${ev.demand} demand`}
                  action={
                    <button className="btn-ghost text-xs" onClick={() => dispatch({ type: "SET_TAB", tab: "research" })}>
                      Open research
                    </button>
                  }
                />
                <ul className="space-y-3">
                  {ev.pains.slice(0, 4).map((p) => (
                    <li key={p.theme} className="rounded-lg border border-line p-3">
                      <div className="flex justify-between gap-3 text-sm">
                        <span className="font-medium">{p.theme}</span>
                        <span className="tnum shrink-0 text-xs text-muted">{p.count} posts</span>
                      </div>
                      {p.quotes[0] && <p className="mt-1 text-sm text-muted">“{p.quotes[0].text}”</p>}
                    </li>
                  ))}
                </ul>
              </Card>
            ) : (
              <div className="animate-rise flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-abyss px-4 py-3">
                <p className="text-sm text-muted">
                  <span className="font-medium text-ink">This is a quick estimate</span> based on what usually goes wrong in {a.category} startups. Get real evidence from Reddit, Hacker News, app reviews and more.
                </p>
                <button className="btn-primary text-sm" onClick={() => dispatch({ type: "SET_TAB", tab: "research" })}>
                  Run market research
                </button>
              </div>
            )}

            <Card className="animate-rise">
              <CardHeader
                eyebrow={ev ? "Typical patterns in this category, not live posts" : "Typical patterns in this category"}
                title={ev ? "Other common reasons startups like this die" : "Brutal reality: 5 common reasons this dies"}
                icon={<Skull className="h-4 w-4 text-flame" />}
              />
              <ol className="space-y-3">
                {a.hurdles.map((h, i) => (
                  <li
                    key={h.title}
                    className={cx(
                      "group grid grid-cols-[auto_minmax(0,1fr)] gap-4 rounded-lg border bg-surface p-4",
                      "border-line",
                    )}
                  >
                    <span
                      className={cx(
                        "grid h-8 w-8 place-items-center rounded-lg text-sm font-semibold",
                        "bg-abyss text-muted",
                      )}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{h.title}</p>
                        <Badge tone={h.severity === "high" ? "flame" : "amber"} className="py-0.5 text-[10px]">
                          {h.severity}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-muted">{h.detail}</p>
                      <p className="mt-2 text-xs text-muted">Common in {h.source.split(" · ")[0]}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>

            <Card className="animate-rise">
              <CardHeader eyebrow="Strategic pivot" title={a.pivot.headline} icon={<Sparkles className="h-4 w-4 text-emerald" />} />
              <p className="text-lg font-medium leading-snug text-ink [text-wrap:balance]">{a.pivot.niche}</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-line bg-abyss p-4">
                  <p className="eyebrow mb-1.5">Why this niche is unserved</p>
                  <p className="text-sm leading-relaxed text-muted">{a.pivot.rationale}</p>
                </div>
                <div className="rounded-lg border border-line bg-abyss p-4">
                  <p className="eyebrow mb-1.5 text-ink">First move this week</p>
                  <p className="text-sm leading-relaxed text-ink">{a.pivot.firstMove}</p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  className="btn-ghost"
                  onClick={() => dispatch({ type: "ASK_COFOUNDER", prompt: "Based on my audit and my traction so far, should I pivot to the suggested niche or keep going? Be straight with me." })}
                >
                  Ask the co-founder: pivot or not?
                </button>
                <button className="btn-primary" onClick={() => dispatch({ type: "SET_TAB", tab: "timetable" })}>
                  Turn this into a 4-week plan <ArrowRight className="h-4 w-4" />
                </button>
                {a.killScore >= 66 && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-amber">
                    <AlertTriangle className="h-3.5 w-3.5" /> Re-run the audit with the pivot niche before you build.
                  </span>
                )}
              </div>
            </Card>
          </>
        ) : null}
      </div>
    </div>
  );
}
