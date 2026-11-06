"use client";

import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, type Dispatch, type ReactNode } from "react";
import { cloudEnabled, cloudUserEmail, openCloudWorkspace, resetCloudWorkspace, saveCloudWorkspace, unlockCloudWorkspace } from "./cloud";
import { addDays, analyzeIdea, daysBetween, buildTasks, computeExecution, gradeFromScore, scoreCheckIn, today, type ExecutionBreakdown } from "./engine";
import { countryByCode, detectCountry, money, prefsFor, samplePrice, setActivePrefs, type Prefs } from "./locale";
import { revenueBetween } from "./revenue";
import type { Analysis, AppState, CheckIn, Decision, IdeaInput, Interview, KillCriteria, Lead, NotifyPrefs, Phase, Profile, ResearchAnalysis, RevenueEntry, Signal, TabId, Task } from "./types";

/* ------------------------------------------------------------- storage -- */
// One workspace per signed-in email, kept in this browser. Swap these three helpers
// for your database once real auth is added (see README).

const SESSION_KEY = "startit:session";
const wsKey = (email: string) => `startit:ws:${email.trim().toLowerCase()}`;

export function loadWorkspace(email: string): AppState | null {
  try {
    const raw = localStorage.getItem(wsKey(email));
    return raw ? (JSON.parse(raw) as AppState) : null;
  } catch {
    return null;
  }
}
/** Remove this founder's workspace from this browser (after account deletion). */
export function forgetWorkspace(email: string) {
  try {
    localStorage.removeItem(wsKey(email));
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem("startit:pendingName");
  } catch {}
}

function saveWorkspace(state: AppState) {
  if (!state.profile) return;
  try {
    const { toast, pendingPrompt, ...rest } = state;
    localStorage.setItem(wsKey(state.profile.email), JSON.stringify({ ...rest, chat: rest.chat.slice(-40), pendingPrompt: null, toast: null }));
    localStorage.setItem(SESSION_KEY, state.profile.email);
  } catch {}
}

/* ---------------------------------------------------------------- seeds -- */

export function sampleIdea(prefs: Prefs): IdeaInput {
  const country = countryByCode(prefs.country)?.name ?? "your country";
  return {
    name: "ClinicQ",
    concept: `WhatsApp-first appointment booking and automated reminders that cut no-shows for small dental clinics. ${money(samplePrice(prefs), prefs)} per month subscription per clinic.`,
    audience:
      prefs.country === "IN"
        ? "Independent single-chair dental clinic owners in Tier-2 Indian cities"
        : `Independent single-chair dental clinic owners in smaller cities in ${country}`,
  };
}

function base(prefs: Prefs, profile: Profile | null): AppState {
  return {
    ready: true,
    profile,
    prefs,
    tab: "audit",
    idea: { name: "", concept: "", audience: "" },
    analysis: null,
    tasks: [],
    checkIns: [],
    penalties: [],
    revenue: [],
    signals: [],
    research: null,
    leads: [],
    interviews: [],
    killCriteria: null,
    decisions: [],
    notify: { email: true, push: false, partnerName: "", partnerEmail: "", pledge: "" },
    seenNotifs: [],
    startDate: today(),
    chat: [],
    pendingPrompt: null,
    toast: null,
  };
}

/** A workspace three weeks into the plan, so every screen has something real to show. */
function sampleWorkspace(prefs: Prefs, profile: Profile | null): AppState {
  setActivePrefs(prefs);
  const idea = sampleIdea(prefs);
  const startDate = addDays(today(), -15);
  const tasks = buildTasks(startDate).map((t, i) => (i < 6 ? { ...t, done: true, doneAt: addDays(t.due, i % 2 === 0 ? 0 : -1) } : t));
  const mk = (week: number, progress: string, goalsSet: number, goalsHit: number, interviews: number, signups: number, revenue: number): CheckIn => {
    const score = scoreCheckIn({ goalsSet, goalsHit, interviews, signups, revenue });
    return { id: `c${week}`, week, submittedAt: addDays(startDate, week * 7 - 1), progress, goalsSet, goalsHit, interviews, signups, revenue, score, grade: gradeFromScore(score) };
  };
  return {
    ...base(prefs, profile),
    idea,
    analysis: analyzeIdea(idea),
    tasks,
    startDate,
    revenue: [
      { id: "r1", date: addDays(today(), -4), amount: samplePrice(prefs), currency: prefs.currency, customer: "Smile Dental", kind: "one-time", source: "manual", note: "Paid pilot, first month" },
      { id: "r2", date: addDays(today(), -1), amount: samplePrice(prefs), currency: prefs.currency, customer: "Bright Teeth Clinic", kind: "subscription", source: "manual" },
    ],
    leads: [
      ["Dr. Meera Rao", "Smile Dental", "WhatsApp", "paid", -4],
      ["Dr. Arjun Shah", "Bright Teeth Clinic", "In person", "paid", -1],
      ["Dr. Kavya Iyer", "Pearl Dental", "WhatsApp", "demo", -2],
      ["Dr. Rohan Das", "Care32", "Cold call", "replied", -9],
      ["Dr. Nisha Pillai", "Tooth Fairy Clinic", "WhatsApp", "contacted", -3],
      ["Dr. Vikram Sen", "DentaFirst", "Email", "contacted", -10],
      ["Dr. Aisha Khan", "Family Dental", "WhatsApp", "contacted", -6],
      ["Dr. Sameer Joshi", "City Smiles", "Email", "lost", -8],
    ].map(([name, company, channel, stage, ago], i) => ({
      id: `l${i}`, name: name as string, company: company as string, channel: channel as string, stage: stage as Lead["stage"],
      value: samplePrice(prefs), nextStep: stage === "demo" ? "Demo on Thursday, bring no-show numbers" : stage === "replied" ? "Send pricing" : "",
      createdAt: addDays(today(), -14), updatedAt: addDays(today(), ago as number),
    })),
    interviews: [
      ["Dr. Meera Rao", "Clinic owner", ["no-shows", "manual reminders"], "I lose two slots a week and I'm the one calling patients at night.", "yes", 5],
      ["Dr. Arjun Shah", "Clinic owner", ["no-shows", "double bookings"], "Patients book on WhatsApp and forget. I can't chase all of them.", "yes", 4],
      ["Priya (receptionist)", "Front desk", ["manual reminders", "too many tools"], "I already juggle three apps, don't give me a fourth.", "no", 3],
      ["Dr. Rohan Das", "Clinic owner", ["no-shows"], "No-shows are annoying but my staff handles it.", "maybe", 2],
      ["Dr. Kavya Iyer", "Clinic owner", ["no-shows", "manual reminders", "price"], "If it pays for itself with one saved slot, sure.", "yes", 4],
    ].map(([person, role, pains, quote, wouldPay, severity], i) => ({
      id: `i${i}`, date: addDays(startDate, i + 1), person: person as string, role: role as string, pains: pains as string[], quote: quote as string,
      wouldPay: wouldPay as Interview["wouldPay"], severity: severity as Interview["severity"],
    })),
    killCriteria: { metric: "paying_customers", target: 5, deadline: addDays(startDate, 42), setAt: startDate },
    checkIns: [
      mk(1, "Interviewed 11 clinic owners. 7 said no-shows cost them 2+ slots a week. Landing page live.", 4, 4, 11, 18, 0),
      mk(2, "Auth, schema and core booking flow working. Analytics slipped to next week.", 4, 3, 3, 9, 0),
    ],
  };
}

/** A real founder's own idea, starting today with an empty record. */
function freshWorkspace(idea: IdeaInput, prefs: Prefs, profile: Profile): AppState {
  setActivePrefs(prefs);
  const start = today();
  return { ...base(prefs, profile), idea, analysis: analyzeIdea(idea), tasks: buildTasks(start), startDate: start };
}

function signedOut(): AppState {
  const code = typeof window !== "undefined" ? detectCountry() : null;
  return { ...base(prefsFor(code ?? "US"), null), ready: false };
}

/* ------------------------------------------------------------- reducer -- */

export type Action =
  | { type: "SET_TAB"; tab: TabId }
  | { type: "SET_IDEA"; idea: IdeaInput }
  | { type: "SET_ANALYSIS"; analysis: Analysis }
  | { type: "TOGGLE_TASK"; id: string }
  | { type: "MISSED_DEADLINE"; ids?: string[] }
  | { type: "SUBMIT_CHECKIN"; data: Omit<CheckIn, "id" | "submittedAt" | "grade" | "score" | "week"> }
  | { type: "TOAST"; tone: "ok" | "warn" | "bad"; text: string }
  | { type: "CLEAR_TOAST" }
  | { type: "HYDRATE"; state: AppState | null }
  | { type: "CHAT_SET"; chat: AppState["chat"] }
  | { type: "ASK_COFOUNDER"; prompt: string }
  | { type: "CONSUME_PROMPT" }
  | { type: "ONBOARD"; profile: Profile; prefs: Prefs; start: "sample" | IdeaInput }
  | { type: "SET_PREFS"; prefs: Prefs }
  | { type: "SIGN_OUT" }
  | { type: "ACCOUNT_DELETED" }
  | { type: "REVENUE_ADD"; entries: RevenueEntry[]; note?: string }
  | { type: "REVENUE_DELETE"; id: string }
  | { type: "TASK_ADD"; title: string; phase: Phase; due: string; tech: boolean }
  | { type: "TASK_DELETE"; id: string }
  | { type: "TASKS_ADD_MANY"; tasks: { title: string; phase: Phase; due: string; tech: boolean }[] }
  | { type: "SIGNALS_ADD"; signals: Signal[] }
  | { type: "SIGNALS_REMOVE"; ids: string[] }
  | { type: "SIGNALS_CLEAR" }
  | { type: "RESEARCH_SET"; research: ResearchAnalysis }
  | { type: "LEAD_ADD"; lead: Lead }
  | { type: "LEAD_UPDATE"; id: string; patch: Partial<Lead> }
  | { type: "LEAD_DELETE"; id: string }
  | { type: "INTERVIEW_ADD"; interview: Interview }
  | { type: "INTERVIEW_DELETE"; id: string }
  | { type: "KILL_SET"; criteria: KillCriteria }
  | { type: "DECISION_ADD"; decision: Decision }
  | { type: "NOTIFY_SET"; notify: NotifyPrefs }
  | { type: "NOTIFS_SEEN"; keys: string[] }
  | { type: "RESET" };

const PENALTY_DAYS = 14;

function reducer(state: AppState, action: Action): AppState {
  const toast = (tone: "ok" | "warn" | "bad", text: string) => ({ id: Date.now(), tone, text });

  switch (action.type) {
    case "SET_TAB":
      return { ...state, tab: action.tab };

    case "SET_IDEA":
      // Evidence from research belongs to one idea; a new pitch needs new evidence.
      return { ...state, idea: action.idea, research: action.idea.concept.trim() === state.idea.concept.trim() ? state.research : null };

    case "SET_ANALYSIS":
      return { ...state, analysis: action.analysis, toast: toast("ok", `Audit complete. Kill Score ${action.analysis.killScore}%.`) };

    case "TOGGLE_TASK": {
      const now = today();
      return { ...state, tasks: state.tasks.map((t) => (t.id === action.id ? { ...t, done: !t.done, doneAt: !t.done ? now : undefined } : t)) };
    }

    case "MISSED_DEADLINE": {
      const now = today();
      const targets = state.tasks.filter((t) => !t.done && (action.ids ? action.ids.includes(t.id) : t.due < now));
      if (!targets.length) return { ...state, toast: toast("ok", "No overdue tasks. Nothing to penalise this week.") };
      const ids = targets.map((t) => t.id);
      return {
        ...state,
        tasks: state.tasks.map((t) => (ids.includes(t.id) ? { ...t, due: addDays(t.due, PENALTY_DAYS), delayed: true, penalties: t.penalties + 1 } : t)),
        penalties: [...state.penalties, { id: `p${Date.now()}`, at: now, taskIds: ids, days: PENALTY_DAYS, reason: "missed", titles: targets.map((t) => t.title) }],
        toast: toast("bad", `${ids.length} task${ids.length > 1 ? "s" : ""} pushed back ${PENALTY_DAYS} days and flagged as delayed.`),
      };
    }

    case "SUBMIT_CHECKIN": {
      const score = scoreCheckIn(action.data);
      const week = (state.checkIns.reduce((m, c) => Math.max(m, c.week), 0) || 0) + 1;
      const now = today();
      const c: CheckIn = { ...action.data, id: `c${Date.now()}`, week, submittedAt: now, score, grade: gradeFromScore(score) };
      // The revenue log stays the single source of truth: if the founder reports more than was
      // logged since the last check-in, the difference is logged as a check-in entry.
      const since = state.checkIns.length ? addDays(state.checkIns[state.checkIns.length - 1].submittedAt, 1) : state.startDate;
      const logged = revenueBetween(state.revenue, state.prefs.currency, since, now);
      const extra = Math.round((action.data.revenue - logged) * 100) / 100;
      const revenue =
        extra > 0
          ? [...state.revenue, { id: `r${Date.now()}`, date: now, amount: extra, currency: state.prefs.currency, customer: "Reported in check-in", kind: "one-time" as const, source: "check-in" as const, note: `Week ${week} check-in` }]
          : state.revenue;
      return {
        ...state,
        revenue,
        checkIns: [...state.checkIns, c],
        toast: toast(score >= 600 ? "ok" : score >= 480 ? "warn" : "bad", `Week ${week} graded ${c.grade} (${score}/1000).`),
      };
    }

    case "TOAST":
      return { ...state, toast: toast(action.tone, action.text) };
    case "CLEAR_TOAST":
      return { ...state, toast: null };

    case "HYDRATE":
      if (!action.state?.profile) return { ...state, ready: true };
      return { ...base(action.state.prefs, action.state.profile), ...action.state, notify: { ...base(action.state.prefs, null).notify, ...action.state.notify }, ready: true, chat: action.state.chat ?? [], pendingPrompt: null, toast: null };

    case "CHAT_SET":
      return { ...state, chat: action.chat };
    case "ASK_COFOUNDER":
      return { ...state, tab: "cofounder", pendingPrompt: action.prompt };
    case "CONSUME_PROMPT":
      return { ...state, pendingPrompt: null };

    case "ONBOARD": {
      const ws = action.start === "sample" ? sampleWorkspace(action.prefs, action.profile) : freshWorkspace(action.start, action.prefs, action.profile);
      return { ...ws, toast: toast("ok", `Welcome, ${action.profile.name.split(" ")[0]}.`) };
    }

    case "SET_PREFS": {
      setActivePrefs(action.prefs);
      const name = countryByCode(action.prefs.country)?.name ?? action.prefs.country;
      return {
        ...state,
        prefs: action.prefs,
        // Re-run so location-specific suggestions (niche, communities) match the new country.
        analysis: state.analysis && state.idea.concept ? analyzeIdea(state.idea) : state.analysis,
        toast: toast("ok", `Location set to ${name}. Money shows in ${action.prefs.currency}.`),
      };
    }

    case "REVENUE_ADD": {
      if (!action.entries.length) return state;
      const n = action.entries.length;
      return {
        ...state,
        revenue: [...state.revenue, ...action.entries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
        toast: toast("ok", action.note ?? (n === 1 ? "Payment logged." : `${n} payments imported.`)),
      };
    }
    case "REVENUE_DELETE":
      return { ...state, revenue: state.revenue.filter((e) => e.id !== action.id), toast: toast("ok", "Payment removed.") };

    case "TASK_ADD": {
      const week = Math.min(4, Math.max(1, Math.floor(daysBetween(state.startDate, action.due) / 7) + 1)) as 1 | 2 | 3 | 4;
      const t = { id: `u${Date.now().toString(36)}`, title: action.title, phase: action.phase, week, due: action.due, originalDue: action.due, tech: action.tech, done: false, delayed: false, penalties: 0, custom: true };
      return { ...state, tasks: [...state.tasks, t], toast: toast("ok", "Task added.") };
    }

    case "TASK_DELETE": {
      const t = state.tasks.find((x) => x.id === action.id);
      if (!t) return state;
      const tasks = state.tasks.filter((x) => x.id !== action.id);
      const now = today();
      // Deleting something you already missed is still a missed deadline.
      if (!t.done && t.due < now) {
        return {
          ...state,
          tasks,
          penalties: [...state.penalties, { id: `p${Date.now()}`, at: now, taskIds: [t.id], days: 0, reason: "deleted", titles: [t.title] }],
          toast: toast("bad", "Overdue task deleted. Logged as a missed deadline (−35)."),
        };
      }
      return { ...state, tasks, toast: toast("ok", "Task deleted.") };
    }

    case "TASKS_ADD_MANY": {
      const mkTask = (x: { title: string; phase: Phase; due: string; tech: boolean }, i: number): Task => ({
        id: `u${Date.now().toString(36)}${i}`, title: x.title, phase: x.phase, week: Math.max(1, Math.floor(daysBetween(state.startDate, x.due) / 7) + 1),
        due: x.due, originalDue: x.due, tech: x.tech, done: false, delayed: false, penalties: 0, custom: true,
      });
      return { ...state, tasks: [...state.tasks, ...action.tasks.map(mkTask)], toast: toast("ok", `${action.tasks.length} task${action.tasks.length === 1 ? "" : "s"} added to your plan.`) };
    }

    case "SIGNALS_ADD": {
      const seen = new Set(state.signals.map((x) => x.url || x.id));
      const fresh = action.signals.filter((x) => !seen.has(x.url || x.id));
      return { ...state, signals: [...fresh, ...state.signals].slice(0, 300), toast: toast("ok", fresh.length ? `${fresh.length} post${fresh.length === 1 ? "" : "s"} added.` : "All of those are already collected.") };
    }
    case "SIGNALS_REMOVE":
      return { ...state, signals: state.signals.filter((x) => !action.ids.includes(x.id)) };
    case "SIGNALS_CLEAR":
      return { ...state, signals: [] };
    case "RESEARCH_SET":
      return { ...state, research: action.research, toast: toast("ok", `Evidence ready: ${action.research.demand} demand, kill score ${action.research.killScore}%.`) };

    case "LEAD_ADD":
      return { ...state, leads: [...state.leads, action.lead], toast: toast("ok", "Lead added.") };
    case "LEAD_UPDATE":
      return { ...state, leads: state.leads.map((l) => (l.id === action.id ? { ...l, ...action.patch, updatedAt: today() } : l)) };
    case "LEAD_DELETE":
      return { ...state, leads: state.leads.filter((l) => l.id !== action.id) };
    case "INTERVIEW_ADD":
      return { ...state, interviews: [...state.interviews, action.interview], toast: toast("ok", "Interview logged.") };
    case "INTERVIEW_DELETE":
      return { ...state, interviews: state.interviews.filter((i) => i.id !== action.id) };

    case "KILL_SET":
      return { ...state, killCriteria: action.criteria, toast: toast("ok", "Kill criteria locked in.") };
    case "DECISION_ADD":
      return { ...state, decisions: [...state.decisions, action.decision] };
    case "NOTIFY_SET":
      return { ...state, notify: action.notify, toast: toast("ok", "Saved.") };
    case "NOTIFS_SEEN":
      return { ...state, seenNotifs: [...new Set([...state.seenNotifs, ...action.keys])].slice(-200) };

    case "ACCOUNT_DELETED":
      if (state.profile) forgetWorkspace(state.profile.email);
      return { ...signedOut(), ready: true, toast: toast("ok", "Your account and all its data were deleted.") };

    case "SIGN_OUT":
      try {
        localStorage.removeItem(SESSION_KEY);
      } catch {}
      return { ...signedOut(), ready: true };

    case "RESET":
      return { ...sampleWorkspace(state.prefs, state.profile), tab: state.tab, toast: toast("ok", "Sample data restored.") };
  }
}

/* ------------------------------------------------------------- context -- */

interface Ctx {
  state: AppState;
  dispatch: Dispatch<Action>;
  exec: ExecutionBreakdown;
  /** Email of the signed-in Supabase user (cloud mode only). */
  cloudEmail: string | null;
  /** End-to-end encryption (cloud mode only). */
  vault: {
    /** The workspace is encrypted and this device needs the recovery key. */
    locked: boolean;
    /** A recovery key to show the founder once, then forget. */
    recovery: string | null;
    unlock: (code: string) => Promise<void>;
    /** Lost key: delete the unreadable workspace and start fresh. */
    reset: () => Promise<void>;
    show: (code: string) => void;
    dismiss: () => void;
  };
}

const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, signedOut);
  // Every money and date formatter reads the active preferences; keep them in step with state.
  setActivePrefs(state.prefs);

  const [cloudEmail, setCloudEmail] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [recovery, setRecovery] = useState<string | null>(null);

  // Restore the founder's workspace: from Supabase when configured, otherwise this browser.
  useEffect(() => {
    (async () => {
      if (cloudEnabled()) {
        try {
          const email = await cloudUserEmail();
          setCloudEmail(email);
          if (!email) {
            dispatch({ type: "HYDRATE", state: null });
            return;
          }
          const opened = await openCloudWorkspace();
          if (opened.kind === "locked") {
            setLocked(true);
            return;
          }
          if (opened.recovery) setRecovery(opened.recovery);
          dispatch({ type: "HYDRATE", state: opened.state });
          return;
        } catch (e) {
          console.warn("Cloud load failed, using this browser:", e);
        }
      }
      let ws: AppState | null = null;
      try {
        const email = localStorage.getItem(SESSION_KEY);
        if (email) ws = loadWorkspace(email);
      } catch {}
      dispatch({ type: "HYDRATE", state: ws });
    })();
  }, []);

  const cloudTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!state.ready || !state.profile) return;
    // Signed in to the cloud: the encrypted copy on the server is the only copy. Otherwise, this browser.
    if (!(cloudEnabled() && cloudEmail)) saveWorkspace(state);
    if (cloudEnabled() && cloudEmail) {
      if (cloudTimer.current) clearTimeout(cloudTimer.current);
      cloudTimer.current = setTimeout(() => void saveCloudWorkspace(state), 1200);
    }
  }, [state, cloudEmail]);

  useEffect(() => {
    if (!state.toast) return;
    const t = setTimeout(() => dispatch({ type: "CLEAR_TOAST" }), 3800);
    return () => clearTimeout(t);
  }, [state.toast]);

  const exec = useMemo(() => computeExecution(state.tasks, state.checkIns, state.penalties), [state.tasks, state.checkIns, state.penalties]);

  const vault = useMemo<Ctx["vault"]>(
    () => ({
      locked,
      recovery,
      unlock: async (code) => {
        const ws = await unlockCloudWorkspace(code);
        setLocked(false);
        dispatch({ type: "HYDRATE", state: ws });
      },
      reset: async () => {
        const code = await resetCloudWorkspace();
        setLocked(false);
        setRecovery(code);
        dispatch({ type: "HYDRATE", state: null });
      },
      show: (code) => setRecovery(code),
      dismiss: () => setRecovery(null),
    }),
    [locked, recovery],
  );

  return <StoreContext.Provider value={{ state, dispatch, exec, cloudEmail, vault }}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}
