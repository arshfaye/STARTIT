"use client";

import { Check, Copy, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { Grade } from "@/lib/types";
import { GRADE_TONE } from "@/lib/engine";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Tone = "emerald" | "cyber" | "amber" | "flame" | "slate";

// Status color lives in the text and a small dot; backgrounds stay neutral.
const TONE_TEXT: Record<Tone, string> = {
  emerald: "text-emerald",
  cyber: "text-ink",
  amber: "text-amber",
  flame: "text-flame",
  slate: "text-muted",
};
const TONE_DOT: Record<Tone, string> = {
  emerald: "bg-emerald",
  cyber: "bg-ink/60",
  amber: "bg-amber",
  flame: "bg-flame",
  slate: "bg-muted/60",
};

export function Badge({ tone = "slate", children, className, dot }: { tone?: Tone; children: ReactNode; glow?: boolean; className?: string; dot?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs font-medium", TONE_TEXT[tone], className)}>
      {dot && <span className={cx("h-1.5 w-1.5 rounded-full", TONE_DOT[tone])} />}
      {children}
    </span>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string; strong?: boolean }) {
  return <section className={cx("rounded-xl border border-line bg-surface p-5 sm:p-6", className)}>{children}</section>;
}

export function CardHeader({ eyebrow, title, action, icon }: { eyebrow?: string; title: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <div className="mt-0.5 shrink-0 text-muted [&_svg]:!text-muted">{icon}</div>}
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-ink [text-wrap:balance]">{title}</h3>
          {eyebrow && <p className="mt-0.5 text-xs text-muted">{eyebrow}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function ProgressBar({ value, tone, className }: { value: number; tone?: "emerald" | "flame" | "amber" | "cyber"; className?: string }) {
  const bar = tone === "flame" ? "bg-flame" : tone === "amber" ? "bg-amber" : value >= 100 ? "bg-emerald" : "bg-ink";
  return (
    <div className={cx("h-1.5 w-full overflow-hidden rounded-full bg-line/70", className)}>
      <div className={cx("h-full rounded-full transition-[width] duration-500 ease-out", bar)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

/** Semicircle gauge. 0 = safe → 100 = dead on arrival. One color, set by severity. */
export function KillGauge({ value }: { value: number }) {
  const r = 88;
  const c = Math.PI * r;
  const tone = value >= 66 ? "var(--bad)" : value >= 38 ? "var(--warn)" : "var(--ok)";
  const label = value >= 66 ? "Dead on arrival" : value >= 38 ? "At risk" : "Survivable";
  return (
    <div className="relative mx-auto w-full max-w-[260px]">
      <svg viewBox="0 0 220 124" className="w-full" role="img" aria-label={`Kill score ${value} percent`}>
        <path d="M22 110 A88 88 0 0 1 198 110" fill="none" stroke="rgb(var(--border))" strokeWidth="10" strokeLinecap="round" />
        <path
          d="M22 110 A88 88 0 0 1 198 110"
          fill="none"
          stroke={`rgb(${tone})`}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value / 100)}
          style={{ transition: "stroke-dashoffset .8s ease-out" }}
        />
      </svg>
      <div className="pointer-events-none absolute inset-x-0 top-[42%] text-center">
        <div className="tnum text-4xl font-semibold tracking-tight text-ink">
          {value}
          <span className="text-xl text-muted">%</span>
        </div>
        <div className="mt-0.5 text-xs font-medium" style={{ color: `rgb(${tone})` }}>
          {label}
        </div>
      </div>
      <div className="-mt-1 flex justify-between px-1 text-[11px] text-muted">
        <span>Safe</span>
        <span>Dead on arrival</span>
      </div>
    </div>
  );
}

/** Ring meter for the 0–1000 execution score. */
export function ScoreRing({ value, max = 1000, size = 168, label }: { value: number; max?: number; size?: number; label?: string }) {
  const r = 72;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 168 168" className="h-full w-full -rotate-90">
        <circle cx="84" cy="84" r={r} fill="none" stroke="rgb(var(--border))" strokeWidth="8" />
        <circle
          cx="84"
          cy="84"
          r={r}
          fill="none"
          stroke="rgb(var(--fg))"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value / max)}
          style={{ transition: "stroke-dashoffset .8s ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="tnum text-3xl font-semibold tracking-tight text-ink">{value}</div>
          <div className="mt-0.5 text-xs text-muted">{label ?? `of ${max}`}</div>
        </div>
      </div>
    </div>
  );
}

export function GradeBadge({ grade, size = "md" }: { grade: Grade; size?: "sm" | "md" | "lg" }) {
  const tone = GRADE_TONE[grade];
  const sizes = { sm: "h-7 w-7 text-xs rounded-md", md: "h-12 w-12 text-xl rounded-lg", lg: "h-20 w-20 text-4xl rounded-xl" }[size];
  const col = { emerald: "text-emerald", cyber: "text-ink", amber: "text-amber", flame: "text-flame" }[tone];
  return <div className={cx("grid shrink-0 place-items-center border border-line bg-abyss font-semibold tracking-tight", sizes, col)}>{grade}</div>;
}

export function Modal({ open, onClose, title, children, wide, top }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; top?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className={cx("fixed inset-0 flex items-end justify-center sm:items-center sm:p-6", top ? "z-[60]" : "z-50")} role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Close" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className={cx(
          "relative max-h-[92vh] w-full animate-rise overflow-y-auto rounded-t-2xl border border-line bg-surface p-5 shadow-2xl sm:rounded-2xl sm:p-6",
          wide ? "sm:max-w-2xl" : "sm:max-w-lg",
        )}
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted transition hover:bg-abyss hover:text-ink" aria-label="Close dialog">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function CopyButton({ text, label = "Copy", className }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className={cx("btn-ghost px-3 py-1.5 text-xs", className)}
      onClick={() => {
        const done = () => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        };
        try {
          navigator.clipboard.writeText(text).then(done, done);
        } catch {
          done();
        }
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : label}
    </button>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "emerald" | "flame" | "amber" | "cyber" }) {
  const col = tone === "flame" ? "text-flame" : tone === "amber" ? "text-amber" : "text-ink";
  return (
    <div className="min-w-0">
      <p className="truncate text-xs text-muted">{label}</p>
      <p className={cx("tnum mt-1 text-2xl font-semibold tracking-tight", col)}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}
