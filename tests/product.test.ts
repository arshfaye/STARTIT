import { describe, expect, test } from "bun:test";
import { nudgesFor } from "@/lib/nudges";
import { effectivePlan, LIMITS, nextTierFor } from "@/lib/plans";
import { pastedToSignals } from "@/lib/research";
import type { AppState } from "@/lib/types";

describe("plans", () => {
  const now = Date.parse("2026-11-02T00:00:00Z");
  test("limits grow with every tier", () => {
    for (const k of ["chat", "search", "research", "plan"] as const) {
      expect(LIMITS.garage[k]).toBeLessThan(LIMITS.launch[k]);
      expect(LIMITS.launch[k]).toBeLessThan(LIMITS.scale[k]);
    }
  });
  test("a cancelled plan lasts until the paid period ends, then drops to Garage", () => {
    expect(effectivePlan({ plan: "launch", status: "canceled", provider: "razorpay", periodEnd: "2026-11-20T00:00:00Z" }, now)).toBe("launch");
    expect(effectivePlan({ plan: "launch", status: "canceled", provider: "razorpay", periodEnd: "2026-10-20T00:00:00Z" }, now)).toBe("garage");
  });
  test("an unpaid checkout or failed renewals give no paid features", () => {
    expect(effectivePlan({ plan: "garage", status: "pending", provider: "razorpay", periodEnd: null }, now)).toBe("garage");
    expect(effectivePlan({ plan: "scale", status: "halted", provider: "razorpay", periodEnd: "2026-11-20T00:00:00Z" }, now)).toBe("garage");
  });
  test("hitting a limit suggests the cheapest tier that fixes it", () => {
    expect(nextTierFor("garage", "chat")).toBe("launch");
    expect(nextTierFor("garage", "update")).toBe("scale"); // investor updates aren't in Launch
    expect(nextTierFor("scale")).toBeNull();
  });
});

describe("reminders", () => {
  const s = {
    profile: { name: "Sara Khan", email: "s@x.co", createdAt: "" },
    idea: { name: "ClinicQ", concept: "", audience: "" },
    prefs: { country: "IN", currency: "INR", locale: "en-IN" },
    startDate: "2026-10-18",
    tasks: [
      { id: "a", title: "Ship analytics", done: false, due: "2026-10-31" },
      { id: "b", title: "Add payments", done: false, due: "2026-11-03" },
    ],
    checkIns: [{ submittedAt: "2026-10-31" }],
    revenue: [],
    leads: [],
    interviews: [],
    penalties: [],
    decisions: [],
    killCriteria: null,
    notify: { partnerEmail: "" },
  } as unknown as AppState;

  test("overdue and due-tomorrow tasks trigger reminders", () => {
    const kinds = nudgesFor(s, "2026-11-02").map((n) => n.kind);
    expect(kinds).toContain("overdue");
    expect(kinds).toContain("due-tomorrow");
  });
  test("the morning brief is a Scale feature", () => {
    expect(nudgesFor(s, "2026-11-02", "launch").some((n) => n.kind === "brief")).toBe(false);
    const brief = nudgesFor(s, "2026-11-02", "scale").find((n) => n.kind === "brief")!;
    expect(brief.body).toContain("Clear the overdue first: Ship analytics");
  });
});

describe("pasted research", () => {
  test("splits posts on blank lines and keeps the subreddit", () => {
    const sig = pastedToSignals(
      "My clinic lost 3 patients this week to no-shows. https://www.reddit.com/r/Dentistry/comments/abc/x\n\nI call everyone myself the night before. Exhausting.\n\nok",
    );
    expect(sig).toHaveLength(2); // "ok" is too short to count
    expect(sig[0].community).toBe("r/Dentistry");
    expect(sig[0].text).not.toContain("https://");
  });
});
