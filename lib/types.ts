export type TabId = "audit" | "timetable" | "accountability" | "launch" | "ledger" | "cofounder" | "revenue" | "research" | "customers";

export type Saturation = "Open Niche" | "Competitive" | "Heavily Saturated";

export interface IdeaInput {
  name: string;
  concept: string;
  audience: string;
}

export interface Hurdle {
  title: string;
  detail: string;
  source: string; // e.g. "r/Dentistry · 214 upvotes"
  severity: "high" | "medium";
}

export interface Analysis {
  killScore: number; // 0 safe – 100 dead on arrival
  saturation: Saturation;
  verdict: string;
  hurdles: Hurdle[];
  pivot: { headline: string; niche: string; rationale: string; firstMove: string };
  competitors: string[];
  signals: { label: string; value: string }[];
  category: Category;
  analyzedAt: string;
}

export type Category =
  | "health"
  | "education"
  | "fintech"
  | "productivity"
  | "commerce"
  | "food"
  | "fitness"
  | "creator"
  | "devtools"
  | "general";

export type Phase = "Validation" | "MVP Build" | "Early-Adopter Launch" | "Growth";

export interface Task {
  id: string;
  title: string;
  phase: Phase;
  week: number;
  due: string; // ISO date (yyyy-mm-dd)
  originalDue: string;
  tech: boolean;
  done: boolean;
  doneAt?: string;
  delayed: boolean;
  penalties: number; // times pushed back
  custom?: boolean; // added by the founder
}

export interface CheckIn {
  id: string;
  week: number;
  submittedAt: string;
  progress: string;
  goalsSet: number;
  goalsHit: number;
  interviews: number;
  signups: number;
  revenue: number;
  grade: Grade;
  score: number;
}

export type Grade = "A+" | "A" | "B+" | "B" | "C" | "D" | "F";

export interface PenaltyEvent {
  id: string;
  at: string;
  taskIds: string[];
  days: number;
  reason?: "missed" | "deleted";
  titles?: string[]; // kept so the log still reads after a task is deleted
}

export interface RevenueEntry {
  id: string;
  date: string; // yyyy-mm-dd
  amount: number; // major units (e.g. 1499.00)
  currency: string; // ISO 4217
  customer: string;
  kind: "subscription" | "one-time";
  source: "manual" | "csv" | "stripe" | "razorpay" | "check-in";
  note?: string;
  extId?: string; // provider payment id, used to skip duplicates
}

export interface Profile {
  name: string;
  email: string;
  createdAt: string;
}

export interface AppState {
  ready: boolean; // storage has been read
  profile: Profile | null;
  prefs: { country: string; currency: string; locale: string };
  tab: TabId;
  idea: IdeaInput;
  analysis: Analysis | null;
  tasks: Task[];
  checkIns: CheckIn[];
  penalties: PenaltyEvent[];
  revenue: RevenueEntry[];
  signals: Signal[];
  research: ResearchAnalysis | null;
  leads: Lead[];
  interviews: Interview[];
  killCriteria: KillCriteria | null;
  decisions: Decision[];
  notify: NotifyPrefs;
  seenNotifs: string[]; // "<kind>:<day>" keys the founder has already seen
  startDate: string;
  chat: { role: "user" | "assistant"; content: string }[];
  pendingPrompt: string | null;
  toast: { id: number; tone: "ok" | "warn" | "bad"; text: string } | null;
}

/* ---------------------------------------------------------- research -- */

export type SignalSource = "reddit" | "hn" | "appstore" | "stackexchange" | "bluesky" | "pasted";

export interface Signal {
  id: string;
  source: SignalSource;
  title: string;
  text: string;
  url?: string;
  author?: string;
  community?: string; // subreddit, "Hacker News", app name, Stack Exchange site, "Bluesky"
  rating?: number; // App Store stars, 1–5
  score?: number;
  comments?: number;
  date?: string; // yyyy-mm-dd
}

export interface PainTheme {
  theme: string;
  count: number; // how many signals mention it
  severity: "high" | "medium" | "low";
  quotes: { text: string; signalId: string }[];
}

export interface ResearchAnalysis {
  at: string;
  query: string;
  signalCount: number;
  sources: SignalSource[];
  summary: string;
  pains: PainTheme[];
  willingnessToPay: string[];
  alternatives: string[]; // tools/workarounds people mention
  opportunity: string;
  demand: "strong" | "moderate" | "weak";
  killScore: number; // evidence-based 0–100
}

/* --------------------------------------------------------- customers -- */

export type LeadStage = "lead" | "contacted" | "replied" | "demo" | "paid" | "lost";

export interface Lead {
  id: string;
  name: string;
  company: string;
  channel: string;
  stage: LeadStage;
  value: number; // expected monthly value in the founder's currency
  nextStep: string;
  updatedAt: string;
  createdAt: string;
}

export interface Interview {
  id: string;
  date: string;
  person: string;
  role: string;
  pains: string[]; // short tags, e.g. "no-shows", "manual reminders"
  quote: string;
  wouldPay: "yes" | "maybe" | "no";
  severity: 1 | 2 | 3 | 4 | 5;
}

/* ---------------------------------------------------- decisions/stakes -- */

export type KillMetric = "paying_customers" | "mrr" | "revenue" | "interviews";

export interface KillCriteria {
  metric: KillMetric;
  target: number;
  deadline: string;
  setAt: string;
}

export interface Decision {
  id: string;
  at: string;
  choice: "double-down" | "pivot" | "kill";
  note: string;
  snapshot: string; // the numbers at the time
}

export interface NotifyPrefs {
  email: boolean;
  push: boolean; // browser push notifications on this account
  partnerName: string;
  partnerEmail: string;
  pledge: string;
}
