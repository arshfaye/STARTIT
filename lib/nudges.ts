/**
 * Which reminders a founder should get today. Pure logic, used by the daily job
 * (app/api/cron/nudges) and testable on its own.
 */
import { decisionDue, weeklyReport } from "./decisions";
import { addDays, daysBetween, parse } from "./engine";
import { money } from "./locale";
import type { PlanId } from "./plans";
import { revenueBetween } from "./revenue";
import type { AppState } from "./types";

export interface Nudge {
  kind: "brief" | "overdue" | "due-tomorrow" | "checkin" | "quiet" | "decision" | "partner";
  /** Where tapping the notification should take the founder. */
  tab: "timetable" | "accountability" | "cofounder";
  subject: string;
  body: string;
  to: "founder" | "partner";
}

/** Last day the founder did anything we can see. */
function lastActivity(s: AppState): string {
  const dates = [
    s.startDate,
    ...s.tasks.map((t) => t.doneAt ?? ""),
    ...s.checkIns.map((c) => c.submittedAt),
    ...s.revenue.map((r) => r.date),
    ...s.leads.map((l) => l.updatedAt),
    ...s.interviews.map((i) => i.date),
  ].filter(Boolean);
  return dates.sort().slice(-1)[0];
}

/** `plan` decides which extras apply: the morning brief is a Scale feature. */
export function nudgesFor(s: AppState, today: string, plan: PlanId = "garage"): Nudge[] {
  if (!s.profile) return [];
  const first = s.profile.name.split(" ")[0];
  const out: Nudge[] = [];
  const open = s.tasks.filter((t) => !t.done);
  const overdue = open.filter((t) => t.due < today);
  const tomorrow = open.filter((t) => t.due === addDays(today, 1));
  const isSunday = parse(today).getUTCDay() === 0;
  const checkedInThisWeek = s.checkIns.some((c) => daysBetween(c.submittedAt, today) < 7);
  const quietDays = daysBetween(lastActivity(s), today);

  if (plan === "scale") out.push(morningBrief(s, today, first));

  if (overdue.length) {
    out.push({
      kind: "overdue",
      tab: "timetable",
      to: "founder",
      subject: `${overdue.length} overdue in ${s.idea.name}`,
      body: `${first}, these are late:\n${overdue.map((t) => `- ${t.title} (due ${t.due})`).join("\n")}\n\nShip one today or accept the penalty in STARTIT. Ignoring it doesn't make it go away.`,
    });
  }
  if (tomorrow.length) {
    out.push({
      kind: "due-tomorrow",
      tab: "timetable",
      to: "founder",
      subject: `Due tomorrow: ${tomorrow[0].title}`,
      body: `${first}, due tomorrow:\n${tomorrow.map((t) => `- ${t.title}`).join("\n")}\n\nMiss it and it moves back 14 days and costs you 35 points.`,
    });
  }
  if (isSunday && !checkedInThisWeek) {
    out.push({ kind: "checkin", tab: "accountability", to: "founder", subject: "Sunday check-in is due", body: `${first}, it's Sunday. Log what shipped, what didn't and your numbers. Skipping it counts as an F.` });
  }
  if (quietDays >= 5) {
    out.push({
      kind: "quiet",
      tab: "cofounder",
      to: "founder",
      subject: `${quietDays} days of silence on ${s.idea.name}`,
      body: `${first}, nothing has moved in ${quietDays} days: no tasks, no leads, no revenue. What's actually going on? Open STARTIT and tell your co-founder the truth.`,
    });
  }
  if (decisionDue(s)) {
    out.push({ kind: "decision", tab: "accountability", to: "founder", subject: "Decision day", body: `${first}, your kill-criteria deadline has passed. Double down, pivot or kill. Make the call in STARTIT today.` });
  }
  if (isSunday && s.notify.partnerEmail) {
    out.push({ kind: "partner", tab: "accountability", to: "partner", subject: `${s.profile.name}'s week on ${s.idea.name}`, body: `Hi ${s.notify.partnerName || "there"},\n\n${s.profile.name} asked you to keep them honest. Here's their week:\n\n${weeklyReport(s)}` });
  }
  return out;
}

/** Scale: one message every morning with the day's priorities, in order. */
function morningBrief(s: AppState, today: string, first: string): Nudge {
  const open = s.tasks.filter((t) => !t.done).sort((a, b) => (a.due < b.due ? -1 : 1));
  const overdue = open.filter((t) => t.due < today);
  const soon = open.filter((t) => t.due >= today && t.due <= addDays(today, 2));
  const cold = s.leads.filter((l) => !["paid", "lost"].includes(l.stage) && daysBetween(l.updatedAt, today) >= 7);
  const demos = s.leads.filter((l) => l.stage === "demo" || l.stage === "replied");
  const week = revenueBetween(s.revenue, s.prefs.currency, addDays(today, -6), today);
  const lines: string[] = [];
  if (overdue.length) lines.push(`Clear the overdue first: ${overdue.slice(0, 2).map((t) => t.title).join("; ")}.`);
  if (soon.length) lines.push(`Due in the next 2 days: ${soon.slice(0, 2).map((t) => t.title).join("; ")}.`);
  if (demos.length) lines.push(`Move ${demos.length} warm lead${demos.length > 1 ? "s" : ""} forward: ${demos.slice(0, 2).map((l) => l.name + (l.nextStep ? ` (${l.nextStep})` : "")).join("; ")}.`);
  if (cold.length) lines.push(`${cold.length} lead${cold.length > 1 ? "s have" : " has"} gone cold. Follow up or mark lost.`);
  if (s.killCriteria && s.killCriteria.deadline >= today) lines.push(`${daysBetween(today, s.killCriteria.deadline)} days to your kill-criteria deadline.`);
  lines.push(`Revenue in the last 7 days: ${money(week, s.prefs)}.`);
  return {
    kind: "brief",
    tab: "timetable",
    to: "founder",
    subject: `Today on ${s.idea.name}: ${overdue.length ? `${overdue.length} overdue` : soon.length ? `${soon.length} due soon` : "go sell"}`,
    body: `Morning ${first}. Here's the order:\n${lines.map((l, i) => `${i + 1}. ${l}`).join("\n")}`,
  };
}

/* ------------------------------------------------ server-side reminders -- */
// The workspace itself is end-to-end encrypted, so the daily job can't read task titles,
// lead names or numbers. The browser saves these content-free facts next to it instead:
// dates and counts only, enough to know *that* something needs attention, never *what*.

export interface ReminderFacts {
  v: 1;
  /** Due dates of open tasks. */
  openDue: string[];
  lastActive: string;
  lastCheckIn: string | null;
  /** Kill-criteria deadline, while no decision has been made since it was set. */
  decisionBy: string | null;
  /** Last-update dates of leads still in play (not paid or lost). */
  liveLeads: string[];
  /** Founder wants reminder emails as well as push. */
  email: boolean;
}

export function reminderFacts(s: AppState): ReminderFacts | null {
  if (!s.profile) return null;
  const k = s.killCriteria;
  return {
    v: 1,
    openDue: s.tasks.filter((t) => !t.done).map((t) => t.due).sort(),
    lastActive: lastActivity(s),
    lastCheckIn: s.checkIns.map((c) => c.submittedAt).sort().slice(-1)[0] ?? null,
    decisionBy: k && !s.decisions.some((d) => d.at >= k.setAt) ? k.deadline : null,
    liveLeads: s.leads.filter((l) => !["paid", "lost"].includes(l.stage)).map((l) => l.updatedAt).sort(),
    email: s.notify?.email !== false,
  };
}

const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

/** Reminders built only from ReminderFacts. Wording is deliberately generic: no titles, names or amounts. */
export function nudgesFromFacts(f: ReminderFacts, today: string, plan: PlanId = "garage"): Nudge[] {
  const out: Nudge[] = [];
  const overdue = f.openDue.filter((d) => d < today).length;
  const tomorrow = f.openDue.filter((d) => d === addDays(today, 1)).length;
  const soon = f.openDue.filter((d) => d >= today && d <= addDays(today, 2)).length;
  const isSunday = parse(today).getUTCDay() === 0;
  const checkedIn = !!f.lastCheckIn && daysBetween(f.lastCheckIn, today) < 7;
  const quiet = daysBetween(f.lastActive, today);
  const cold = f.liveLeads.filter((d) => daysBetween(d, today) >= 7).length;

  if (plan === "scale") {
    const lines = [
      overdue && `Clear ${plural(overdue, "overdue task")} first.`,
      soon && `${plural(soon, "task")} due in the next 2 days.`,
      f.liveLeads.length && `${plural(f.liveLeads.length, "lead")} in play${cold ? `, ${cold} gone cold` : ""}. Follow up today.`,
      f.decisionBy && f.decisionBy >= today && `${daysBetween(today, f.decisionBy)} days to your kill-criteria deadline.`,
    ].filter(Boolean) as string[];
    if (!lines.length) lines.push("Nothing urgent. Spend the morning selling.");
    out.push({
      kind: "brief",
      tab: "timetable",
      to: "founder",
      subject: overdue ? `Today: ${overdue} overdue` : soon ? `Today: ${soon} due soon` : "Today: go sell",
      body: `Good morning. Here's the order:\n${lines.map((l, i) => `${i + 1}. ${l}`).join("\n")}\n\nOpen STARTIT for the details.`,
    });
  }
  if (overdue) out.push({ kind: "overdue", tab: "timetable", to: "founder", subject: `${plural(overdue, "task")} overdue`, body: `You have ${plural(overdue, "overdue task")}. Ship one today or accept the penalty in STARTIT.` });
  if (tomorrow) out.push({ kind: "due-tomorrow", tab: "timetable", to: "founder", subject: `${plural(tomorrow, "task")} due tomorrow`, body: `Miss it and it moves back 14 days and costs you 35 points. Open STARTIT to see what's due.` });
  if (isSunday && !checkedIn) out.push({ kind: "checkin", tab: "accountability", to: "founder", subject: "Sunday check-in is due", body: "Log what shipped, what didn't and your numbers. Skipping it counts as an F." });
  if (quiet >= 5) out.push({ kind: "quiet", tab: "cofounder", to: "founder", subject: `${quiet} days of silence`, body: `Nothing has moved in ${quiet} days. What's actually going on? Open STARTIT and tell your co-founder the truth.` });
  if (f.decisionBy && today >= f.decisionBy) out.push({ kind: "decision", tab: "accountability", to: "founder", subject: "Decision day", body: "Your kill-criteria deadline has passed. Double down, pivot or kill. Make the call in STARTIT today." });
  return out;
}
