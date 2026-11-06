/**
 * Pre-written AI for the public demo.
 *
 * The demo has no AI (no API key, no accounts), which hid STARTIT's best features. When the AI
 * isn't switched on and the visitor is exploring the ClinicQ sample, these stand in for the
 * co-founder, research analysis, plan rebuild and investor update. They're written for the
 * sample but read its live numbers, so they stay accurate as the visitor clicks around, and
 * every answer says it's a demo.
 *
 * Nothing here runs for a founder's own startup: they get the real "AI isn't switched on" message.
 */
import { addDays, computeExecution, daysBetween, today } from "./engine";
import { money } from "./locale";
import { revenueTotals } from "./revenue";
import type { AppState, IdeaInput, ResearchAnalysis, Signal } from "./types";

export const DEMO_NOTE = "_Pre-written demo answer for the ClinicQ sample. In the full app, the co-founder answers anything you ask, from your own data._";

export function isDemoWorkspace(s: Pick<AppState, "idea" | "interviews">): boolean {
  return s.idea?.name === "ClinicQ" && s.interviews.some((i) => i.person === "Dr. Meera Rao");
}

export const isDemoIdea = (idea: IdeaInput) => idea.name === "ClinicQ";

/* ----------------------------------------------------------------- chat -- */

function facts(s: AppState) {
  const now = today();
  const exec = computeExecution(s.tasks, s.checkIns, s.penalties, now);
  const open = s.tasks.filter((t) => !t.done).sort((a, b) => (a.due < b.due ? -1 : 1));
  const overdue = open.filter((t) => t.due < now);
  const soon = open.filter((t) => t.due >= now && t.due <= addDays(now, 3));
  const paying = s.leads.filter((l) => l.stage === "paid");
  const warm = s.leads.filter((l) => l.stage === "demo" || l.stage === "replied");
  const cold = s.leads.filter((l) => !["paid", "lost"].includes(l.stage) && daysBetween(l.updatedAt, now) >= 7);
  const contacted = s.leads.filter((l) => l.stage !== "lead").length;
  const replied = s.leads.filter((l) => ["replied", "demo", "paid"].includes(l.stage)).length;
  const rev = revenueTotals(s.revenue, s.prefs.currency, now);
  const target = s.killCriteria?.target ?? 5;
  const daysLeft = s.killCriteria ? daysBetween(now, s.killCriteria.deadline) : null;
  const lastCheck = s.checkIns[s.checkIns.length - 1];
  const yes = s.interviews.filter((i) => i.wouldPay === "yes").length;
  return { now, exec, open, overdue, soon, paying, warm, cold, contacted, replied, rev, target, daysLeft, lastCheck, yes };
}

const list = (xs: string[]) => xs.map((x) => `- ${x}`).join("\n");
const m = (s: AppState, n: number) => money(n, s.prefs);

function today_(s: AppState) {
  const f = facts(s);
  const orders: string[] = [];
  if (f.overdue.length) orders.push(`**Before noon:** finish "${f.overdue[0].title}". It's overdue, and every day it sits there is a penalty waiting to happen.`);
  if (f.warm[0]) orders.push(`**Close ${f.warm[0].name} (${f.warm[0].company}).** ${f.warm[0].nextStep || "Send pricing today"}. Bring the no-show numbers from your interviews, not features.`);
  if (f.cold.length) orders.push(`**Follow up with ${f.cold.length} cold lead${f.cold.length > 1 ? "s" : ""}** (${f.cold.map((l) => l.name).slice(0, 2).join(", ")}). One WhatsApp each. If they don't reply by Friday, mark them lost.`);
  orders.push(`**Book 3 new clinic conversations.** You have ${f.paying.length} paying of the ${f.target} you promised yourself${f.daysLeft != null ? `, with ${f.daysLeft} days left` : ""}. The pipeline is too thin to get there.`);
  return `Here's today, in order. No building until the selling is done.

${orders.map((o, i) => `${i + 1}. ${o}`).join("\n")}

${f.soon.length ? `Also due in the next 3 days: ${f.soon.slice(0, 2).map((t) => `"${t.title}"`).join(" and ")}. Don't let them slip into next week.` : "Nothing else is due in the next 3 days, so there's no excuse to skip the calls."}

Report back tonight with how many conversations you booked.`;
}

function roast(s: AppState) {
  const f = facts(s);
  const hit = f.lastCheck ? `${f.lastCheck.goalsHit} of ${f.lastCheck.goalsSet}` : "none";
  return `You asked for it.

**Grade: ${f.exec.grade} (${f.exec.score}/1000).** Not bad. Not good either.

**What's working:**
- You talked to customers before building. ${s.interviews.length} interviews, ${f.yes} said they'd pay. That's real signal.
- ${f.paying.length} clinics are paying (${m(s, f.rev.last30)} in the last 30 days). Most founders at week 3 have zero.

**What isn't:**
- ${f.overdue.length ? `${f.overdue.length} task${f.overdue.length > 1 ? "s are" : " is"} overdue, including "${f.overdue[0].title}". You keep starting new things before finishing old ones.` : "Nothing is overdue, but your pace has dropped since week 1."}
- Last week you hit ${hit} goals${f.lastCheck && f.lastCheck.goalsHit < f.lastCheck.goalsSet ? ". Week 1 you hit all of them. Week 2 you didn't. Notice the trend before it becomes a habit." : "."}
- ${f.cold.length} lead${f.cold.length === 1 ? " has" : "s have"} gone cold. You're collecting leads, not closing them.

**This week's orders:**
1. Clear every overdue task by Wednesday.
2. Move ${f.warm.length || 2} warm lead${f.warm.length === 1 ? "" : "s"} to paid or lost. No more "maybe".
3. Ten new conversations before Sunday's check-in.`;
}

function pivot(s: AppState) {
  const f = facts(s);
  return `**Keep going. Don't pivot.** Here's why, from your numbers, not your feelings:

- **The pain is real.** ${f.yes} of ${s.interviews.length} clinic owners you interviewed said they'd pay, and they all named the same problem: no-shows costing 2+ slots a week.
- **People are paying.** ${f.paying.length} clinics pay you ${m(s, f.paying[0]?.value ?? 0)} a month. A pivot throws that away.
- **Your problem is speed, not the idea.** You're at ${f.paying.length} of ${f.target} paying customers${f.daysLeft != null ? ` with ${f.daysLeft} days to your deadline` : ""}. At this pace you'll miss it, but more conversations fix that, not a new idea.

**One warning sign:** the receptionist said "don't give me a fourth app". Front desks may resist even when owners buy. Ask your next 3 clinics who would actually use it every day.

**Pivot only if** you reach your deadline with fewer than ${Math.max(2, f.target - 2)} paying clinics after 30 more conversations. That's the bar you set. Hold yourself to it.`;
}

function revenue(s: AppState) {
  const f = facts(s);
  const replyRate = f.contacted ? Math.round((f.replied / f.contacted) * 100) : 0;
  return `You *are* getting revenue: ${m(s, f.rev.last30)} in the last 30 days from ${f.paying.length} clinics. The real question is why it isn't growing faster.

**Your leak is the first message.** You contacted ${f.contacted} clinics and only ${f.replied} replied (${replyRate}%). Everyone who got to a demo has paid or is about to. The product sells. Your outreach doesn't.

**Fix it this week:**
1. Rewrite your opening WhatsApp around their number, not your product: "How many patients didn't show up last week?"
2. Lead with proof: "${f.paying[0]?.company ?? "A clinic near you"} cut no-shows in their first month."
3. Send 15 new messages and track replies in Customers. Aim for 40%.

Cold email reached ${s.leads.filter((l) => l.channel === "Email").length} clinics and none have paid. Stop using email for this market. WhatsApp and walking in are what work.`;
}

function research(s: AppState) {
  const r = s.research;
  if (!r) {
    return `You haven't run market research yet, so I'm working from interviews alone. Open **Market Research**, load the sample posts and analyse them. Then ask me again.`;
  }
  return `Your research backs the idea, with one big change.

**What the evidence says:** ${r.summary}

**What to change:** stop pitching "booking". Clinics already have a way to book. Pitch **"fewer empty chairs"**, measured in money: one saved slot a week pays for ${s.idea.name}. That's the pain people actually describe.

**This week:**
1. Rewrite your landing page headline around no-shows, not features.
2. Ask every lead how many no-shows they had last week. Use the number in your pitch.
3. ${r.alternatives[0] ? `Position against ${r.alternatives[0].split(/[,(]/)[0].trim()}: they're the workaround people are tired of.` : "Position against manual reminder calls: that's the workaround people are tired of."}`;
}

function decision(s: AppState) {
  const f = facts(s);
  return `**Double down.** You set the bar at ${f.target} paying clinics. You're at ${f.paying.length}. That's a miss, and I won't pretend otherwise.

But look at *why*: every clinic that saw a demo either paid or is about to. You didn't fail to find demand. You failed to reach enough clinics.

**My conditions for doubling down:**
1. Reset the deadline to 4 weeks from today. Not longer.
2. Target: ${f.target} paying clinics, unchanged. Don't lower the bar to make yourself feel better.
3. 10 new conversations a week, logged in Customers. Miss two weeks in a row and we revisit kill.

Write that down as your decision. If you're tempted to pivot instead, tell me what new evidence you have. "I'm bored" isn't evidence.`;
}

function fallback(s: AppState) {
  const f = facts(s);
  return `In this demo I've only got answers ready for the suggested questions, so here's where ${s.idea.name} stands:

- **Execution:** ${f.exec.grade}, ${f.exec.score}/1000, ${f.overdue.length} overdue
- **Customers:** ${f.paying.length} paying of your ${f.target} target, ${f.warm.length} warm, ${f.cold.length} gone cold
- **Revenue:** ${m(s, f.rev.last30)} in the last 30 days

Try one of the suggested questions, like "What should I do today?", to see how I give orders.`;
}

export function demoReply(s: AppState, question: string): string {
  const q = question.toLowerCase();
  const body = /decision day|kill criteria|double down/.test(q)
    ? decision(s)
    : /research|evidence/.test(q)
      ? research(s)
      : /pivot|keep going/.test(q)
        ? pivot(s)
        : /roast|grade/.test(q)
          ? roast(s)
          : /revenue|money|sales|paying/.test(q)
            ? revenue(s)
            : /today|orders|what should i do|this week/.test(q)
              ? today_(s)
              : fallback(s);
  return `${body}\n\n${DEMO_NOTE}`;
}

/** Plays a pre-written answer out like a live one, a few words at a time. */
export async function streamDemo(text: string, onText: (t: string) => void, signal: AbortSignal): Promise<string> {
  const words = text.split(/(?<=\s)/);
  let out = "";
  for (let i = 0; i < words.length; i += 3) {
    if (signal.aborted) return out;
    out += words.slice(i, i + 3).join("");
    onText(out);
    await new Promise((r) => setTimeout(r, 18));
  }
  return out;
}

/* ------------------------------------------------------------- research -- */

/** Example posts for the demo. Written for this demo and labelled as such: no real people, no links. */
export function demoPosts(): Signal[] {
  const posts: [string, string, string][] = [
    ["Patients book on WhatsApp and then just don't come", "Running a 1-chair clinic. People message on WhatsApp to book, I confirm, and 2 or 3 every week simply don't turn up. No call, nothing. That's a full morning gone.", "clinic_owner_pune"],
    ["How do you remind patients without calling everyone?", "My receptionist calls every patient the evening before. It takes her almost an hour a day. Is there anything simple that sends reminders on WhatsApp automatically?", "dr_s_dental"],
    ["Tried a big practice management software, too much", "We paid for a full clinic management suite. Training took weeks, my staff hated it, and we only used the reminders. Cancelled after 3 months.", "smallclinic_doc"],
    ["No-shows are killing my weekday afternoons", "Afternoon slots are the worst. Booked, confirmed, then nobody. I'd happily pay for something that cuts that in half.", "tier2_dentist"],
    ["Would you pay for reminder software?", "If it's cheap and works on WhatsApp, yes. If it's another app my staff must log into every day, no. We already juggle too many tools.", "frontdesk_priya"],
    ["Double bookings from WhatsApp messages", "Two people booked the same slot through different chats and we only noticed when both arrived. Embarrassing. Need one place where bookings live.", "dental_care_owner"],
    ["Is a deposit the only real fix?", "Some clinics take a small deposit to stop no-shows. Patients here don't like paying in advance. Reminders feel like the friendlier option.", "ortho_newbie"],
    ["Google Calendar plus manual texts", "Our current system is Google Calendar and typing reminder messages by hand. It works when we remember. We often don't.", "smiledesk"],
  ];
  return posts.map(([title, text, author], i) => ({
    id: `demo-${i + 1}`,
    source: "pasted",
    title,
    text,
    author,
    community: "Example post (demo)",
    date: addDays(today(), -(i * 3 + 2)),
  }));
}

export function demoAnalysis(signals: Signal[], query: string): ResearchAnalysis | null {
  const ids = new Set(signals.map((s) => s.id));
  if (!signals.length || !signals.every((s) => s.id.startsWith("demo-"))) return null;
  const q = (id: string, text: string) => (ids.has(id) ? [{ signalId: id, text }] : []);
  return {
    at: new Date().toISOString(),
    query,
    signalCount: signals.length,
    sources: ["pasted"],
    summary:
      "Clear, repeated pain: small clinics lose several slots a week to no-shows, and today's fixes are manual calls or heavy software they don't use. Owners say they'd pay if it's cheap, works on WhatsApp and doesn't add another app for staff. (Demo analysis of example posts.)",
    pains: [
      { theme: "No-shows waste whole slots every week", count: 3, severity: "high", quotes: [...q("demo-1", "2 or 3 every week simply don't turn up. No call, nothing."), ...q("demo-4", "I'd happily pay for something that cuts that in half.")] },
      { theme: "Reminders are done by hand and eat staff time", count: 2, severity: "high", quotes: [...q("demo-2", "It takes her almost an hour a day."), ...q("demo-8", "It works when we remember. We often don't.")] },
      { theme: "Full practice software is too heavy", count: 2, severity: "medium", quotes: [...q("demo-3", "my staff hated it, and we only used the reminders."), ...q("demo-5", "We already juggle too many tools.")] },
      { theme: "Bookings scattered across WhatsApp chats", count: 1, severity: "medium", quotes: q("demo-6", "Need one place where bookings live.") },
    ],
    willingnessToPay: ["\"I'd happily pay for something that cuts that in half.\"", "\"If it's cheap and works on WhatsApp, yes.\""],
    alternatives: ["Manual reminder calls by the receptionist", "Google Calendar plus hand-typed messages", "Full clinic management suites (too heavy)", "Taking deposits (patients dislike it)"],
    opportunity:
      "A WhatsApp-only reminder and booking tool for single-chair clinics, priced below the cost of one lost appointment a month, with zero setup for front-desk staff.",
    demand: "strong",
    killScore: 18,
  };
}

/* ------------------------------------------------- plan rebuild, update -- */

export function demoPlan(s: AppState) {
  const f = facts(s);
  return [
    { title: f.overdue[0] ? `Finish "${f.overdue[0].title}"` : "Ship the reminder delivery report", phase: "MVP Build" as const, dueInDays: 2, tech: true, why: "It's been slipping. Close it before starting anything new." },
    { title: `Close ${f.warm[0]?.name ?? "your warmest lead"} with no-show numbers`, phase: "Early-Adopter Launch" as const, dueInDays: 3, tech: false, why: "Every demo so far has converted. Get the next one over the line." },
    { title: "Rewrite the first WhatsApp message around no-shows", phase: "Early-Adopter Launch" as const, dueInDays: 2, tech: false, why: `Only ${f.replied} of ${f.contacted} contacted clinics replied. The opener is the leak.` },
    { title: "Book 10 new clinic conversations", phase: "Early-Adopter Launch" as const, dueInDays: 7, tech: false, why: `You need ${Math.max(0, f.target - f.paying.length)} more paying clinics to hit your kill criteria.` },
    { title: "Ask both paying clinics for a referral", phase: "Growth" as const, dueInDays: 5, tech: false, why: "Owners know other owners. Referrals close faster than cold messages." },
    { title: "Add a one-tap \"confirm or reschedule\" reply", phase: "MVP Build" as const, dueInDays: 10, tech: true, why: "Three interviewees asked for it. It's the feature that cuts no-shows most." },
  ];
}

export function demoUpdate(s: AppState) {
  const f = facts(s);
  const month = new Date().toLocaleString("en", { month: "long", year: "numeric" });
  return {
    subject: `${s.idea.name} update: ${month} — first ${f.paying.length} paying clinics`,
    body: `Hi all,

Highlights
- ${f.paying.length} dental clinics are now paying for ${s.idea.name}.
- ${s.interviews.length} owner interviews: ${f.yes} said they'd pay, all naming no-shows as the core pain.

Key numbers
- Revenue (last 30 days): ${m(s, f.rev.last30)}
- MRR: ${m(s, f.rev.mrr)}
- Paying customers: ${f.paying.length} · Pipeline: ${f.warm.length} warm, ${f.cold.length} gone cold

What we shipped
- WhatsApp booking flow and automated reminders, live with both paying clinics.

What didn't go to plan
- ${f.overdue.length ? `${f.overdue.length} task${f.overdue.length > 1 ? "s" : ""} slipped past deadline, including analytics.` : "Analytics slipped a week."}
- Cold email isn't working for this market: no replies from clinics contacted that way.

Next month's focus
- Reach ${f.target} paying clinics. 10 new conversations a week, WhatsApp and walk-ins only.

Asks
- Intros to dental clinic owners or dental supply distributors in Tier-2 cities.

Thanks,
${s.profile?.name.split(" ")[0] ?? "The founder"}

(Demo draft for the ClinicQ sample. The full app writes this from your own logged numbers.)`,
  };
}
