"use client";

import { ArrowLeft, ArrowRight, Check, MapPin, Search } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { COUNTRIES, CURRENCIES, countryByCode, detectCountry, flag, longDate, money, prefsFor, samplePrice, type Prefs } from "@/lib/locale";
import { cloudEnabled, cloudSignOut, deleteCloudAccount, sendMagicLink, verifyEmailCode } from "@/lib/cloud";
import { disablePush, enablePush, pushSupport, testPush } from "@/lib/push";
import { openPlans, PlanSection } from "./Billing";
import { useBilling } from "@/lib/usePlan";
import { atLeast } from "@/lib/plans";
import { loadWorkspace, useStore } from "@/lib/store";
import type { IdeaInput } from "@/lib/types";
import { LEGAL_VERSION } from "@/lib/legal";
import { cx } from "./ui";
import { EncryptionSettings } from "./Vault";

type Step = "account" | "location" | "startup";
const STEPS: Step[] = ["account", "location", "startup"];

export function Onboarding() {
  const { dispatch, cloudEmail } = useStore();
  const cloud = cloudEnabled();
  const [step, setStep] = useState<Step>("account");
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem("startit:pendingName") ?? "";
    } catch {
      return "";
    }
  });
  const [email, setEmail] = useState(cloudEmail ?? "");
  const [linkSent, setLinkSent] = useState(false);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const submitCode = async () => {
    if (!/^\d{6}$/.test(code.trim())) return setErr("Enter the 6-digit code from the email.");
    setErr(null);
    setVerifying(true);
    try {
      await verifyEmailCode(email.trim(), code.trim());
      // Signed in: reload so the workspace (or setup, for a new account) loads from the server.
      window.location.reload();
    } catch (e) {
      setErr((e as Error).message);
      setVerifying(false);
    }
  };
  const [err, setErr] = useState<string | null>(null);

  const detected = useMemo(() => detectCountry(), []);
  const [prefs, setPrefs] = useState<Prefs>(() => prefsFor(detected ?? "US"));

  const [mode, setMode] = useState<"own" | "sample">("own");
  const [idea, setIdea] = useState<IdeaInput>({ name: "", concept: "", audience: "" });

  const profile = () => ({
    name: name.trim(),
    email: email.trim().toLowerCase(),
    createdAt: new Date().toISOString(),
    consent: { version: LEGAL_VERSION, at: new Date().toISOString(), adult: true as const },
  });

  const submitAccount = async () => {
    if (!name.trim()) return setErr("Enter your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErr("Enter a valid email address.");
    if (!agreed) return setErr("Tick the box to confirm you're 18 or older and agree to the Terms and Privacy policy.");
    setErr(null);
    // Cloud mode: prove the email with a magic link first. The workspace loads when they come back.
    if (cloud && !cloudEmail) {
      try {
        localStorage.setItem("startit:pendingName", name.trim());
      } catch {}
      try {
        await sendMagicLink(email.trim());
        setLinkSent(true);
      } catch (e) {
        setErr((e as Error).message);
      }
      return;
    }
    const existing = loadWorkspace(email);
    if (existing?.profile) {
      dispatch({ type: "HYDRATE", state: existing });
      dispatch({ type: "TOAST", tone: "ok", text: `Welcome back, ${existing.profile.name.split(" ")[0]}.` });
      return;
    }
    setStep("location");
  };

  const finish = () => {
    if (mode === "own" && (!idea.name.trim() || !idea.concept.trim() || !idea.audience.trim())) {
      return setErr("Fill in all three fields, or explore the sample startup instead.");
    }
    setErr(null);
    dispatch({ type: "ONBOARD", profile: profile(), prefs, start: mode === "sample" ? "sample" : idea });
  };

  const i = STEPS.indexOf(step);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="app-header flex items-center justify-between px-4 py-4 sm:px-8">
        <Logo />
        {i > 0 && (
          <div className="flex items-center gap-1.5" aria-label={`Step ${i + 1} of 3`}>
            {STEPS.map((s, k) => (
              <span key={s} className={cx("h-1.5 rounded-full transition-all", k <= i ? "w-6 bg-ink" : "w-1.5 bg-line")} />
            ))}
          </div>
        )}
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-8 sm:items-center sm:pt-0">
        <div key={step} className="w-full max-w-[420px] animate-rise">
          {step === "account" && linkSent && (
            <form
              className="text-center"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void submitCode();
              }}
            >
              <h1 className="text-2xl font-semibold tracking-tight">Check your inbox</h1>
              <p className="mt-2 text-sm text-muted">
                We sent a sign-in email to <span className="text-ink">{email}</span>. Enter the 6-digit code from it, or tap the link on this device.
              </p>
              <label htmlFor="ob-code" className="sr-only">6-digit code</label>
              <input
                id="ob-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className="field tnum mt-6 py-3 text-center text-2xl tracking-[0.4em]"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
              />
              {err && <p className="mt-2 text-sm text-flame">{err}</p>}
              <button type="submit" className="btn-primary mt-3 w-full py-2.5" disabled={verifying || code.length !== 6}>
                {verifying ? "Signing in…" : "Sign in"}
              </button>
              <button
                type="button"
                className="btn-ghost mt-2 w-full"
                onClick={() => {
                  setLinkSent(false);
                  setCode("");
                  setErr(null);
                }}
              >
                Use a different email
              </button>
            </form>
          )}

          {step === "account" && !linkSent && (
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                submitAccount();
              }}
            >
              <h1 className="text-center text-2xl font-semibold tracking-tight [text-wrap:balance]">Welcome to startit</h1>
              <p className="mt-2 text-center text-sm text-muted">The co-founder that tells you the truth. Sign in or create your account.</p>
              <div className="mt-8 space-y-3">
                <div>
                  <label htmlFor="ob-name" className="mb-1.5 block text-sm font-medium">Full name</label>
                  <input id="ob-name" autoComplete="name" className="field py-2.5" value={name} onChange={(e) => setName(e.target.value)} placeholder="Aarav Mehta" />
                </div>
                <div>
                  <label htmlFor="ob-email" className="mb-1.5 block text-sm font-medium">Email</label>
                  <input id="ob-email" type="email" autoComplete="email" className="field py-2.5 disabled:opacity-70" disabled={!!cloudEmail} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
                </div>
                <label className="flex cursor-pointer items-start gap-2.5 pt-1 text-sm leading-snug text-muted">
                  <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-current" />
                  <span>
                    I&apos;m 18 or older and I agree to the <LegalLink href="/terms">Terms of service</LegalLink> and <LegalLink href="/privacy">Privacy policy</LegalLink>.
                  </span>
                </label>
                {err && <p className="text-sm text-flame">{err}</p>}
                <button type="submit" className="btn-primary w-full py-2.5">Continue</button>
              </div>
              <p className="mt-6 text-center text-xs leading-relaxed text-muted">
                {cloud
                  ? cloudEmail
                    ? "You're signed in. Finish setting up your workspace."
                    : "We'll email you a sign-in code. No password needed."
                  : "Your workspace is saved in this browser under your email. Use the same email to pick up where you left off."}
              </p>
              <div className="mt-3">
                <LegalLinks />
              </div>
            </form>
          )}

          {step === "location" && (
            <LocationStep
              prefs={prefs}
              setPrefs={setPrefs}
              detected={detected}
              onBack={() => setStep("account")}
              onNext={() => setStep("startup")}
            />
          )}

          {step === "startup" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                finish();
              }}
            >
              <h1 className="text-2xl font-semibold tracking-tight">What are you building?</h1>
              <p className="mt-2 text-sm text-muted">We&apos;ll audit it straight away. Be specific, vague pitches get torn apart.</p>

              <div role="radiogroup" aria-label="How to start" className="mt-6 grid grid-cols-2 gap-1 rounded-lg border border-line bg-abyss p-1">
                {(
                  [
                    ["own", "My startup"],
                    ["sample", "Explore a sample"],
                  ] as const
                ).map(([m, l]) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={mode === m}
                    onClick={() => {
                      setMode(m);
                      setErr(null);
                    }}
                    className={cx("rounded-md py-2 text-sm transition", mode === m ? "bg-surface font-medium text-ink shadow-sm" : "text-muted hover:text-ink")}
                  >
                    {l}
                  </button>
                ))}
              </div>

              {mode === "own" ? (
                <div className="mt-5 space-y-3">
                  <div>
                    <label htmlFor="ob-sname" className="mb-1.5 block text-sm font-medium">Startup name</label>
                    <input id="ob-sname" className="field py-2.5" value={idea.name} onChange={(e) => setIdea({ ...idea, name: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="ob-concept" className="mb-1.5 block text-sm font-medium">What it does and what it costs</label>
                    <textarea
                      id="ob-concept"
                      rows={3}
                      className="field resize-none py-2.5"
                      value={idea.concept}
                      onChange={(e) => setIdea({ ...idea, concept: e.target.value })}
                      placeholder={`e.g. Bookkeeping for freelancers, ${money(samplePrice(prefs), prefs)} a month`}
                    />
                  </div>
                  <div>
                    <label htmlFor="ob-aud" className="mb-1.5 block text-sm font-medium">Who it&apos;s for</label>
                    <input
                      id="ob-aud"
                      className="field py-2.5"
                      value={idea.audience}
                      onChange={(e) => setIdea({ ...idea, audience: e.target.value })}
                      placeholder={`Job title + context, in ${countryByCode(prefs.country)?.name ?? "your country"}`}
                    />
                  </div>
                </div>
              ) : (
                <div className="mt-5 rounded-xl border border-line p-4">
                  <p className="font-medium">ClinicQ</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">
                    WhatsApp booking for small dental clinics at {money(samplePrice(prefs), prefs)} a month, three weeks into its plan with check-ins, an overdue task and a full audit. Good for
                    seeing every feature before you add your own idea.
                  </p>
                </div>
              )}

              {err && <p className="mt-3 text-sm text-flame">{err}</p>}
              <div className="mt-6 flex gap-2">
                <button type="button" className="btn-ghost" onClick={() => setStep("location")} aria-label="Back">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <button type="submit" className="btn-primary flex-1 py-2.5">
                  {mode === "own" ? "Audit my idea" : "Open the sample"} <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

function LocationStep({
  prefs,
  setPrefs,
  detected,
  onBack,
  onNext,
}: {
  prefs: Prefs;
  setPrefs: (p: Prefs) => void;
  detected: string | null;
  onBack: () => void;
  onNext: () => void;
}) {
  const [q, setQ] = useState("");
  const list = COUNTRIES.filter((c) => !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()) || c.currency.toLowerCase().includes(q.trim().toLowerCase()));
  const sel = countryByCode(prefs.country);
  const det = detected ? countryByCode(detected) : null;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Where are you building?</h1>
      <p className="mt-2 text-sm text-muted">This sets your currency, number format and dates, and tells your co-founder which market you&apos;re in.</p>

      {det && det.code !== prefs.country && (
        <button onClick={() => setPrefs(prefsFor(det.code))} className="mt-5 flex w-full items-center gap-2 rounded-lg border border-line px-3 py-2.5 text-left text-sm transition hover:bg-abyss">
          <MapPin className="h-4 w-4 text-muted" /> Looks like you&apos;re in <span className="font-medium">{det.name}</span>
          <span className="ml-auto text-xs text-muted">Use this</span>
        </button>
      )}

      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <label htmlFor="ob-country-search" className="sr-only">Search countries</label>
        <input id="ob-country-search" className="field py-2.5 pl-9" placeholder="Search country or currency" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ul role="listbox" aria-label="Country" className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-line">
        {list.map((c) => {
          const on = c.code === prefs.country;
          return (
            <li key={c.code} role="option" aria-selected={on}>
              <button
                onClick={() => setPrefs(prefsFor(c.code))}
                className={cx("flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition", on ? "bg-abyss font-medium" : "hover:bg-abyss")}
              >
                <span className="text-base leading-none" aria-hidden>{flag(c.code)}</span>
                <span className="flex-1">{c.name}</span>
                <span className="text-xs text-muted">{c.currency}</span>
                {on && <Check className="h-4 w-4" />}
              </button>
            </li>
          );
        })}
        {!list.length && <li className="px-3 py-3 text-sm text-muted">No match. Try the currency code, like EUR.</li>}
      </ul>

      <div className="mt-4 grid grid-cols-[1fr_auto] items-end gap-3">
        <div>
          <label htmlFor="ob-currency" className="mb-1.5 block text-sm font-medium">Currency</label>
          <select
            id="ob-currency"
            className="field py-2.5"
            value={prefs.currency}
            onChange={(e) => setPrefs({ ...prefs, currency: e.target.value })}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
                {c === sel?.currency ? ` (${sel.name})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="pb-2.5 text-right text-xs text-muted">
          <div className="tnum text-sm font-medium text-ink">{money(125000, prefs)}</div>
          {longDate(new Date().toISOString().slice(0, 10), prefs)}
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">Billing in a different currency than your country? Change it here. You can update both later in Settings.</p>

      <div className="mt-6 flex gap-2">
        <button className="btn-ghost" onClick={onBack} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <button className="btn-primary flex-1 py-2.5" onClick={onNext}>
          Continue with {sel?.name} · {prefs.currency} <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-6 w-6 place-items-center rounded-md bg-ink text-obsidian">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 15l5-5 4 4 5-6" />
        </svg>
      </span>
      <span className="text-[15px] font-semibold tracking-tight">startit</span>
    </div>
  );
}

/** Location, currency and account controls, opened from the sidebar profile. */
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore();
  const [draft, setDraft] = useState<Prefs>(state.prefs);
  const [confirmReset, setConfirmReset] = useState(false);
  const changed = draft.country !== state.prefs.country || draft.currency !== state.prefs.currency;
  const sel = countryByCode(draft.country);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-abyss text-sm font-semibold">{state.profile?.name.slice(0, 1).toUpperCase()}</div>
        <div className="min-w-0">
          <p className="truncate font-medium">{state.profile?.name}</p>
          <p className="truncate text-sm text-muted">{state.profile?.email}</p>
        </div>
      </div>

      <PlanSection />

      <div className="space-y-3 border-t border-line pt-5">
        <p className="text-sm font-medium">Location & currency</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="st-country" className="mb-1.5 block text-xs text-muted">Country</label>
            <select id="st-country" className="field" value={draft.country} onChange={(e) => setDraft(prefsFor(e.target.value))}>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {flag(c.code)} {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="st-currency" className="mb-1.5 block text-xs text-muted">Currency</label>
            <select id="st-currency" className="field" value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value })}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                  {c === sel?.currency ? ` (${sel.name})` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-muted">
          Preview: <span className="tnum text-ink">{money(125000, draft)}</span> · {longDate(new Date().toISOString().slice(0, 10), draft)}. Amounts you&apos;ve already logged keep their numbers;
          only the symbol and format change.
        </p>
        <button className="btn-primary" disabled={!changed} onClick={() => dispatch({ type: "SET_PREFS", prefs: draft })}>
          Save location
        </button>
      </div>

      <Reminders />

      <div className="space-y-3 border-t border-line pt-5">
        <p className="text-sm font-medium">Privacy and encryption</p>
        <EncryptionSettings />
      </div>

      <div className="space-y-2 border-t border-line pt-5">
        {!confirmReset ? (
          <button className="btn-ghost w-full justify-start" onClick={() => setConfirmReset(true)}>
            Replace my workspace with sample data
          </button>
        ) : (
          <div className="rounded-lg border border-flame/30 p-3">
            <p className="text-sm">This deletes your tasks, check-ins and chat in this workspace. Continue?</p>
            <div className="mt-3 flex gap-2">
              <button
                className="btn-danger"
                onClick={() => {
                  dispatch({ type: "RESET" });
                  onClose();
                }}
              >
                Replace with sample
              </button>
              <button className="btn-ghost" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
        <button
          className="btn-ghost w-full justify-start"
          onClick={() => {
            onClose();
            void cloudSignOut();
            dispatch({ type: "SIGN_OUT" });
          }}
        >
          Sign out
        </button>
      </div>

      <DeleteAccount onClose={onClose} />
      <LegalLinks className="justify-start" />
    </div>
  );
}

/** Required by the App Store and Google Play: users must be able to delete their account in the app. */
function DeleteAccount({ onClose }: { onClose: () => void }) {
  const { dispatch } = useStore();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      if (cloudEnabled()) await deleteCloudAccount();
      onClose();
      dispatch({ type: "ACCOUNT_DELETED" });
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="border-t border-line pt-5">
        <button className="text-sm text-flame hover:underline" onClick={() => setOpen(true)}>Delete account</button>
      </div>
    );
  }
  return (
    <div className="space-y-3 rounded-lg border border-flame/40 p-4">
      <p className="text-sm font-medium">Delete your account permanently?</p>
      <p className="text-xs leading-relaxed text-muted">
        This deletes your workspace, tasks, check-ins, revenue log, customers, research and chat history. Any paid plan is cancelled straight away, with no further charges. This can&apos;t be undone.
      </p>
      <div>
        <label htmlFor="del-confirm" className="mb-1.5 block text-xs text-muted">Type DELETE to confirm</label>
        <input id="del-confirm" className="field" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
      </div>
      {err && <p className="text-xs text-flame">{err}</p>}
      <div className="flex gap-2">
        <button className="btn-danger" disabled={typed.trim() !== "DELETE" || busy} onClick={run}>
          {busy ? "Deleting…" : "Delete my account"}
        </button>
        <button className="btn-ghost" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

/** Links to the privacy policy and terms. Hidden in the Claude preview, which has no such pages. */
/** A link to a legal page where the server has one (not in the single-file preview). */
function LegalLink({ href, children }: { href: string; children: ReactNode }) {
  const { status } = useBilling();
  if (!status) return <span className="text-ink">{children}</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-ink underline underline-offset-2">
      {children}
    </a>
  );
}

export function LegalLinks({ className }: { className?: string }) {
  const { status } = useBilling();
  if (!status) return null;
  return (
    <p className={cx("flex flex-wrap justify-center gap-x-3 text-xs text-muted", className)}>
      <a href="/privacy" className="underline-offset-2 hover:text-ink hover:underline">Privacy policy</a>
      <a href="/terms" className="underline-offset-2 hover:text-ink hover:underline">Terms of service</a>
    </p>
  );
}

function Reminders() {
  const { state, dispatch } = useStore();
  const n = state.notify;
  const support = pushSupport();
  const { plan } = useBilling();
  // In the store app push isn't available at all, so say that instead of mentioning a plan.
  const needsLaunch = plan != null && !atLeast(plan, "launch") && support !== "app";
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const togglePush = async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (n.push) {
        await disablePush();
        dispatch({ type: "NOTIFY_SET", notify: { ...n, push: false } });
      } else {
        await enablePush();
        dispatch({ type: "NOTIFY_SET", notify: { ...n, push: true } });
        await testPush();
        setMsg({ tone: "ok", text: "Push is on for this device. You should see a test notification." });
      }
    } catch (e) {
      setMsg({ tone: "bad", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const note: Record<Exclude<typeof support, "ok">, string> = {
    preview: "Push notifications work in the installed STARTIT app. Here, use the bell at the top.",
    "not-configured": "Push isn't set up on this server yet (needs Supabase and VAPID keys).",
    unsupported: "This browser can't receive push notifications. The bell at the top still works.",
    "needs-install": "On iPhone, tap Share → Add to Home Screen, open STARTIT from there, then turn this on.",
    app: "Push notifications aren't available in the phone app yet. The bell at the top shows every reminder.",
  };

  return (
    <div className="space-y-3 border-t border-line pt-5">
      <div>
        <p className="text-sm font-medium">Notifications</p>
        <p className="mt-0.5 text-xs text-muted">Deadline warnings, the Sunday check-in, decision day, and a nudge from your co-founder when you go quiet.</p>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm">Push notifications on this device</p>
          {needsLaunch ? (
            <p className="mt-0.5 text-xs text-muted">
              Part of Launch.{" "}
              <button className="underline underline-offset-2 hover:text-ink" onClick={() => openPlans("launch")}>See plans</button>
            </p>
          ) : (
            support !== "ok" && <p className="mt-0.5 text-xs text-muted">{note[support]}</p>
          )}
        </div>
        <button
          role="switch"
          aria-checked={n.push}
          aria-label="Push notifications"
          disabled={support !== "ok" || busy || needsLaunch}
          onClick={togglePush}
          className={cx("relative h-6 w-10 shrink-0 rounded-full transition disabled:opacity-40", n.push ? "bg-ink" : "bg-line")}
        >
          <span className={cx("absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-all", n.push ? "left-[18px]" : "left-0.5")} />
        </button>
      </div>
      {msg && <p className={cx("text-xs", msg.tone === "ok" ? "text-emerald" : "text-flame")}>{msg.text}</p>}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm">
          Email reminders to {state.profile?.email}
          {needsLaunch && <span className="block text-xs text-muted">Part of Launch.</span>}
        </p>
        <button
          role="switch"
          aria-checked={n.email}
          aria-label="Email reminders"
          onClick={() => dispatch({ type: "NOTIFY_SET", notify: { ...n, email: !n.email } })}
          className={cx("relative h-6 w-10 shrink-0 rounded-full transition", n.email ? "bg-ink" : "bg-line")}
        >
          <span className={cx("absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-all", n.email ? "left-[18px]" : "left-0.5")} />
        </button>
      </div>
    </div>
  );
}
