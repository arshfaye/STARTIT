import { describe, expect, test } from "bun:test";
import { analyzeIdea, buildTasks, computeExecution, gradeFromScore, scoreCheckIn } from "@/lib/engine";
import type { PenaltyEvent, Task } from "@/lib/types";

describe("idea audit (Kill Score)", () => {
  test("a vague, buzzword-heavy pitch scores as dead on arrival", () => {
    const a = analyzeIdea({ name: "SnapTask", concept: "An AI-powered productivity platform for everyone.", audience: "Everyone" });
    expect(a.killScore).toBeGreaterThanOrEqual(66);
    expect(a.saturation).toBe("Heavily Saturated");
  });

  test("a specific, priced niche scores as survivable", () => {
    const a = analyzeIdea({
      name: "ClinicQ",
      concept: "WhatsApp-first booking and reminders that cut no-shows for small dental clinics. ₹1,499 per month per clinic.",
      audience: "Independent single-chair dental clinic owners in Tier-2 Indian cities",
    });
    expect(a.killScore).toBeLessThan(38);
    expect(a.saturation).toBe("Open Niche");
    expect(a.hurdles).toHaveLength(5);
  });

  test("a pitch with no price is told to name one", () => {
    const a = analyzeIdea({ name: "X", concept: "A booking tool for small yoga studios that hate spreadsheets.", audience: "Independent yoga studio owners" });
    expect(a.hurdles.some((h) => h.title.includes("who pays"))).toBe(true);
  });
});

describe("grading", () => {
  test("letter grades follow the documented thresholds", () => {
    expect([900, 800, 700, 600, 480, 350, 0].map(gradeFromScore)).toEqual(["A+", "A", "B+", "B", "C", "D", "F"]);
  });

  test("70% of a check-in score is goals hit vs set", () => {
    expect(scoreCheckIn({ goalsSet: 4, goalsHit: 4, interviews: 0, signups: 0, revenue: 0 })).toBe(700);
    expect(scoreCheckIn({ goalsSet: 4, goalsHit: 2, interviews: 0, signups: 0, revenue: 0 })).toBe(350);
  });
});

describe("execution score can't be gamed", () => {
  const start = "2026-10-01";
  const now = "2026-10-20";
  const tasks: Task[] = buildTasks(start).map((t, i) => (i < 5 ? { ...t, done: true, doneAt: t.due } : t));

  test("deleting an overdue task lowers the score instead of raising it", () => {
    const overdue = tasks.find((t) => !t.done && t.due < now)!;
    const before = computeExecution(tasks, [], [], now).score;
    const penalty: PenaltyEvent = { id: "p1", at: now, taskIds: [overdue.id], days: 0, reason: "deleted", titles: [overdue.title] };
    const after = computeExecution(tasks.filter((t) => t.id !== overdue.id), [], [penalty], now).score;
    expect(after).toBeLessThan(before);
  });

  test("each penalised task costs 35 points", () => {
    const base = computeExecution(tasks, [], [], now).score;
    const pen: PenaltyEvent = { id: "p", at: now, taskIds: ["a", "b"], days: 14, reason: "missed" };
    expect(base - computeExecution(tasks, [], [pen], now).score).toBe(70);
  });
});
