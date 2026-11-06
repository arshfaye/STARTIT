import { describe, expect, test } from "bun:test";
import { demoAnalysis, demoPlan, demoPosts, demoReply, demoUpdate, isDemoWorkspace } from "@/lib/demo";
import { addDays, today } from "@/lib/engine";
import type { AppState } from "@/lib/types";

const now = today();
const sample = {
  profile: { name: "Aarav Mehta", email: "a@x.com", createdAt: now },
  prefs: { country: "IN", currency: "INR", locale: "en-IN" },
  idea: { name: "ClinicQ", concept: "WhatsApp reminders", audience: "Dental clinics" },
  tasks: [
    { id: "t1", title: "Wire analytics events", due: addDays(now, -2), done: false, phase: "MVP Build", tech: true },
    { id: "t2", title: "Ship reminders", due: addDays(now, 2), done: false, phase: "MVP Build", tech: true },
  ],
  checkIns: [{ id: "c1", week: 1, submittedAt: addDays(now, -6), goalsSet: 4, goalsHit: 3, score: 700, grade: "B" }],
  penalties: [],
  revenue: [{ id: "r1", date: addDays(now, -3), amount: 1499, currency: "INR", customer: "Smile Dental", kind: "subscription", source: "manual" }],
  leads: [
    { id: "l1", name: "Dr. Meera Rao", company: "Smile Dental", channel: "WhatsApp", stage: "paid", value: 1499, nextStep: "", updatedAt: addDays(now, -3), createdAt: now },
    { id: "l2", name: "Dr. Kavya Iyer", company: "Pearl Dental", channel: "WhatsApp", stage: "demo", value: 1499, nextStep: "Demo on Thursday", updatedAt: addDays(now, -2), createdAt: now },
    { id: "l3", name: "Dr. Vikram Sen", company: "DentaFirst", channel: "Email", stage: "contacted", value: 1499, nextStep: "", updatedAt: addDays(now, -10), createdAt: now },
  ],
  interviews: [{ id: "i1", person: "Dr. Meera Rao", role: "Owner", pains: [], quote: "", wouldPay: "yes", severity: 5, date: now }],
  killCriteria: { metric: "paying_customers", target: 5, deadline: addDays(now, 20), setAt: addDays(now, -15) },
  decisions: [],
  signals: [],
  research: null,
  chat: [],
} as unknown as AppState;

describe("pre-written demo AI", () => {
  test("only the ClinicQ sample gets demo answers", () => {
    expect(isDemoWorkspace(sample)).toBe(true);
    expect(isDemoWorkspace({ ...sample, idea: { ...sample.idea, name: "MyStartup" } })).toBe(false);
  });

  test("chat answers use the workspace's live numbers and say they're a demo", () => {
    const a = demoReply(sample, "What should I do today?");
    expect(a).toContain("Wire analytics events");
    expect(a).toContain("Dr. Kavya Iyer");
    expect(a).toContain("1 paying of the 5");
    expect(a).toContain("Pre-written demo answer");
    expect(demoReply(sample, "Should I pivot or keep going?")).toContain("Keep going");
    expect(demoReply(sample, "Roast my execution this month.")).toContain("Grade:");
    expect(demoReply(sample, "something random")).toContain("suggested questions");
  });

  test("research analysis only covers the example posts, and every quote points at one", () => {
    const posts = demoPosts();
    const a = demoAnalysis(posts, "no-shows")!;
    const ids = new Set(posts.map((p) => p.id));
    expect(a.pains.length).toBeGreaterThan(2);
    for (const p of a.pains) for (const q of p.quotes) expect(ids.has(q.signalId)).toBe(true);
    expect(posts.every((p) => !p.url)).toBe(true);
    expect(demoAnalysis([{ id: "x", source: "pasted", title: "t", text: "t" }], "q")).toBeNull();
  });

  test("plan and investor update are built from the sample", () => {
    expect(demoPlan(sample)[0].title).toContain("Wire analytics events");
    expect(demoUpdate(sample).body).toContain("Demo draft");
  });
});
