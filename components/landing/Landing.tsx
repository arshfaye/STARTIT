import { BadgeCheck, CalendarCheck, Gauge, Lock, MessageSquareText, Search, Target, Users } from "lucide-react";
import type { ReactNode } from "react";
import { TIERS } from "@/lib/plans";
import { ForwardToApp, StartButton } from "./Client";

const GITHUB = "https://github.com/arshfaye/STARTIT";

function Mark({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <span className="grid h-6 w-6 place-items-center rounded-md bg-ink text-obsidian">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 15l5-5 4 4 5-6" />
        </svg>
      </span>
      <span className="text-[15px] font-semibold tracking-tight">startit</span>
    </span>
  );
}

function Shot({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-line bg-surface shadow-[0_24px_60px_-28px_rgb(0_0_0/0.35)] ${className}`}>
      <div className="flex items-center gap-1.5 border-b border-line bg-abyss px-3 py-2" aria-hidden>
        <span className="h-2 w-2 rounded-full bg-line" />
        <span className="h-2 w-2 rounded-full bg-line" />
        <span className="h-2 w-2 rounded-full bg-line" />
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} width={1544} height={966} loading="lazy" decoding="async" className="block h-auto w-full" />
    </div>
  );
}

function Section({ id, eyebrow, title, sub, children }: { id?: string; eyebrow: string; title: string; sub?: string; children: ReactNode }) {
  return (
    <section id={id} className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 sm:py-24">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">{eyebrow}</p>
      <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight [text-wrap:balance] sm:text-4xl">{title}</h2>
      {sub && <p className="mt-3 max-w-2xl text-[17px] leading-relaxed text-muted">{sub}</p>}
      <div className="mt-12">{children}</div>
    </section>
  );
}

const STEPS = [
  {
    n: "01",
    title: "Find out if anyone needs it",
    body: "Pitch your idea like you would to a skeptic. STARTIT gives it a Kill Score from 0 to 100, the five most likely ways it dies, and a smaller niche to try instead. Then it checks the idea against real complaints from Hacker News, App Store reviews, Stack Exchange and Bluesky.",
    src: "/screens/audit.webp",
    alt: "Idea Audit with a Kill Score of 13% for a dental clinic booking app",
  },
  {
    n: "02",
    title: "Get graded every Sunday",
    body: "Your idea becomes a 4-week plan with real deadlines. Every Sunday you check in and get a letter grade. Miss a deadline and the task moves back 14 days and costs you points. Deleting it doesn't help: that counts as a miss too.",
    src: "/screens/accountability.webp",
    alt: "Accountability screen with a B+ grade, a 705 execution score and one missed deadline",
  },
  {
    n: "03",
    title: "Do the part that actually matters: selling",
    body: "Track every lead from first message to paid, see where your pipeline leaks, log customer interviews and revenue. Your AI co-founder reads all of it and ends every answer with dated orders.",
    src: "/screens/customers.webp",
    alt: "Customers screen with a sales pipeline from 8 leads to 2 paying clinics",
  },
];

const FEATURES = [
  { icon: Gauge, title: "Kill Score", body: "A 0–100 verdict on your idea, from patterns or from real evidence once you've done research." },
  { icon: Search, title: "Market research", body: "Real posts and reviews clustered into pains, with exact quotes credited and linked to the source." },
  { icon: CalendarCheck, title: "A plan that adapts", body: "Validation → MVP → Launch → Growth, rebuilt from what actually happened, not what you hoped." },
  { icon: Target, title: "Kill criteria", body: "Set your pass/fail line in advance. On decision day you double down, pivot or kill. In writing." },
  { icon: Users, title: "Customers and revenue", body: "Pipeline with conversion rates, interview log, revenue with CSV import, MRR and run rate." },
  { icon: MessageSquareText, title: "An honest co-founder", body: "A chat that reads your whole workspace and never sugar-coats. Every answer ends with orders." },
];

export function Landing() {
  return (
    <div className="min-h-screen bg-obsidian">
      <ForwardToApp />

      <header className="sticky top-0 z-30 border-b border-line/70 bg-obsidian/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <a href="/" aria-label="STARTIT home">
            <Mark />
          </a>
          <nav className="flex items-center gap-1 text-sm sm:gap-2">
            <a href="#how" className="hidden rounded-md px-2.5 py-1.5 text-muted hover:text-ink sm:block">How it works</a>
            <a href="#pricing" className="hidden rounded-md px-2.5 py-1.5 text-muted hover:text-ink sm:block">Pricing</a>
            <a href={GITHUB} className="hidden rounded-md px-2.5 py-1.5 text-muted hover:text-ink sm:block">GitHub</a>
            <StartButton className="btn-primary ml-1" />
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald" /> Your AI co-founder
            </p>
            <h1 className="mt-6 text-[2.6rem] font-semibold leading-[1.05] tracking-tight [text-wrap:balance] sm:text-6xl">The co-founder that tells you the truth.</h1>
            <p className="mx-auto mt-5 max-w-2xl text-[17px] leading-relaxed text-muted [text-wrap:pretty] sm:text-lg">
              Most AI tools praise every idea. STARTIT stress-tests yours against real customer complaints, turns it into a week-by-week plan, and grades you every Sunday on what you actually
              shipped.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <StartButton className="btn-primary w-full px-5 py-2.5 text-[15px] sm:w-auto" />
              <a href={GITHUB} className="btn-ghost w-full px-5 py-2.5 text-[15px] sm:w-auto">View the code</a>
            </div>
            <p className="mt-4 text-xs text-muted">Free demo · no sign-up needed · your data stays in your browser</p>
          </div>
          <Shot src="/screens/audit.webp" alt="STARTIT's Idea Audit screen" className="mx-auto mt-14 max-w-5xl" />
        </section>

        {/* The problem */}
        <section className="border-y border-line bg-surface">
          <div className="mx-auto grid max-w-6xl gap-px px-4 sm:px-6 md:grid-cols-3">
            {[
              ["Generic AI", "“What a great idea! Here's a 40-page business plan.”"],
              ["Most founders", "Build for months, then find out nobody wanted it."],
              ["STARTIT", "“13% kill score. Your risk is speed, not the idea. Book 3 calls today.”"],
            ].map(([who, line], i) => (
              <div key={who} className="py-8 md:px-6 md:first:pl-0 md:last:pr-0">
                <p className={`text-xs font-medium uppercase tracking-[0.14em] ${i === 2 ? "text-emerald" : "text-muted"}`}>{who}</p>
                <p className={`mt-2 text-[17px] leading-snug ${i === 2 ? "font-medium" : "text-muted"}`}>{line}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <Section id="how" eyebrow="How it works" title="From raw idea to paying customers, with someone keeping score." sub="Three stages, one workspace. Every screen feeds the co-founder, so its advice comes from your real numbers.">
          <div className="space-y-20">
            {STEPS.map((s, i) => (
              <div key={s.n} className="grid items-center gap-8 md:grid-cols-5 md:gap-12">
                <div className={`md:col-span-2 ${i % 2 ? "md:order-2" : ""}`}>
                  <p className="font-mono text-sm text-muted">{s.n}</p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-tight [text-wrap:balance]">{s.title}</h3>
                  <p className="mt-3 text-[16px] leading-relaxed text-muted">{s.body}</p>
                </div>
                <Shot src={s.src} alt={s.alt} className={`md:col-span-3 ${i % 2 ? "md:order-1" : ""}`} />
              </div>
            ))}
          </div>
        </Section>

        {/* Features */}
        <section className="border-t border-line">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Everything in one place</p>
            <div className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <div key={f.title}>
                  <f.icon className="h-5 w-5" aria-hidden />
                  <h3 className="mt-3 font-semibold">{f.title}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Privacy */}
        <section className="border-y border-line bg-surface">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center md:justify-between">
            <div className="flex gap-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-line bg-obsidian">
                <Lock className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Your idea stays yours.</h2>
                <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-muted">
                  Workspaces are end-to-end encrypted on your device with a key only you hold. Not us, not anyone with access to our servers, can read them. No ads, no selling data, no
                  training AI on your plans.
                </p>
              </div>
            </div>
            <a href="/privacy" className="btn-ghost shrink-0 self-start md:self-center">Read the privacy policy</a>
          </div>
        </section>

        {/* Pricing */}
        <Section id="pricing" eyebrow="Pricing" title="Start free. Pay when you're selling." sub="Prices in rupees, with US dollars alongside. STARTIT is in development and plans aren't on sale yet; the demo is free and has every screen.">
          <div className="grid gap-4 md:grid-cols-3">
            {TIERS.map((t) => (
              <div key={t.id} className={`flex flex-col rounded-xl border bg-surface p-6 ${t.id === "launch" ? "border-ink" : "border-line"}`}>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{t.name}</h3>
                  {t.id === "launch" && <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-medium text-obsidian">Most popular</span>}
                </div>
                <p className="mt-3">
                  <span className="text-3xl font-semibold tracking-tight">{t.price.INR ? `₹${t.price.INR.toLocaleString("en-IN")}` : "Free"}</span>
                  {t.price.INR > 0 && <span className="text-sm text-muted"> /month · ${t.price.USD}</span>}
                </p>
                <p className="mt-2 text-sm text-muted">{t.tagline}</p>
                <ul className="mt-5 space-y-2 text-sm">
                  {t.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        {/* Final CTA */}
        <section className="border-t border-line">
          <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 sm:py-24">
            <h2 className="text-3xl font-semibold tracking-tight [text-wrap:balance] sm:text-4xl">See what it says about a real startup.</h2>
            <p className="mx-auto mt-3 max-w-xl text-[17px] leading-relaxed text-muted">
              Open the demo, pick <b className="font-medium text-ink">Explore a sample</b>, and walk through ClinicQ: a dental booking startup three weeks in, with its audit, plan, pipeline and
              co-founder.
            </p>
            <StartButton className="btn-primary mt-8 px-5 py-2.5 text-[15px]" label="Open the demo" />
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <Mark className="text-ink" />
            <span>Built by Arsh Faye</span>
          </div>
          <nav className="flex flex-wrap gap-x-5 gap-y-2">
            <a href={GITHUB} className="hover:text-ink">GitHub</a>
            <a href="https://www.linkedin.com/in/arsh-faye-6766b9357" className="hover:text-ink">LinkedIn</a>
            <a href="/privacy" className="hover:text-ink">Privacy</a>
            <a href="/terms" className="hover:text-ink">Terms</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
