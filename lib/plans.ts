/**
 * STARTIT plans: Garage (free), Launch and Scale. Shared by the server (enforcement) and the app
 * (pricing screen). Prices here are display copy; the amount actually charged is the price you
 * create in Razorpay / Stripe (see README). Keep them in sync.
 */
export type PlanId = "garage" | "launch" | "scale";
export type QuotaKind = "chat" | "search" | "research" | "plan" | "update";

export interface Tier {
  id: PlanId;
  name: string;
  tagline: string;
  price: { INR: number; USD: number }; // per month
  limits: Record<QuotaKind, number>; // per day
  features: string[]; // what this tier adds; shown on the plans screen
}

export const TIERS: Tier[] = [
  {
    id: "garage",
    name: "Garage",
    tagline: "Validate the idea before you spend anything.",
    price: { INR: 0, USD: 0 },
    limits: { chat: 10, search: 5, research: 2, plan: 1, update: 0 },
    features: [
      "Idea audit, 4-week plan and weekly grading",
      "Revenue, customer pipeline and interview logs",
      "In-app notifications",
      "10 AI co-founder messages a day",
      "5 live searches and 2 research analyses a day",
      "1 AI plan rebuild a day",
    ],
  },
  {
    id: "launch",
    name: "Launch",
    tagline: "For founders selling to real customers.",
    price: { INR: 499, USD: 9 },
    limits: { chat: 150, search: 50, research: 20, plan: 8, update: 0 },
    features: [
      "Everything in Garage",
      "150 AI co-founder messages a day",
      "50 live searches and 20 research analyses a day",
      "8 AI plan rebuilds a day",
      "Push notifications and email reminders",
      "Weekly report emailed to your accountability partner",
    ],
  },
  {
    id: "scale",
    name: "Scale",
    tagline: "For founders with revenue, investors and a team to answer to.",
    price: { INR: 1499, USD: 29 },
    limits: { chat: 400, search: 150, research: 60, plan: 25, update: 10 },
    features: [
      "Everything in Launch",
      "400 AI co-founder messages a day",
      "150 live searches and 60 research analyses a day",
      "25 AI plan rebuilds a day",
      "Morning brief: today's priorities, every morning",
      "AI investor updates drafted from your real numbers",
    ],
  },
];

export const tier = (id: PlanId) => TIERS.find((t) => t.id === id)!;
export const LIMITS = Object.fromEntries(TIERS.map((t) => [t.id, t.limits])) as Record<PlanId, Record<QuotaKind, number>>;
const RANK: Record<PlanId, number> = { garage: 0, launch: 1, scale: 2 };
export const atLeast = (plan: PlanId, min: PlanId) => RANK[plan] >= RANK[min];
export const isPaid = (p: PlanId) => p !== "garage";

/** The cheapest tier that allows more of this quota than the current plan does. */
export function nextTierFor(plan: PlanId, kind?: QuotaKind): PlanId | null {
  const up = TIERS.filter((t) => RANK[t.id] > RANK[plan]);
  if (!kind) return up[0]?.id ?? null;
  return up.find((t) => t.limits[kind] > LIMITS[plan][kind])?.id ?? null;
}

export const QUOTA_LABEL: Record<QuotaKind, string> = {
  chat: "AI co-founder messages",
  search: "Live market searches",
  research: "Research analyses",
  plan: "Plan rebuilds",
  update: "Investor updates",
};

export interface Subscription {
  plan: PlanId;
  status: string; // provider status: active, trialing, past_due, canceled, …
  provider: "stripe" | "razorpay" | null;
  periodEnd: string | null; // ISO
}

/** Paid tier while paid up, and until the end of a period already paid for after cancelling. */
export function effectivePlan(sub: Subscription | null, now = Date.now()): PlanId {
  if (!sub || !isPaid(sub.plan)) return "garage";
  if (["active", "trialing", "authenticated", "charged"].includes(sub.status)) return sub.plan;
  if (sub.periodEnd && Date.parse(sub.periodEnd) > now && ["canceled", "cancelled", "completed", "past_due"].includes(sub.status)) return sub.plan;
  return "garage";
}

/** India pays in INR through Razorpay; everyone else in USD through Stripe. */
export const billingProviderFor = (country: string): "razorpay" | "stripe" => (country === "IN" ? "razorpay" : "stripe");
