import { describe, expect, test } from "bun:test";
import { nudgesFromFacts, reminderFacts } from "@/lib/nudges";
import type { AppState } from "@/lib/types";
import { createKey, formatRecovery, isSealed, keyFromRecovery, open, parseRecovery, seal, WrongKeyError } from "@/lib/vault";

describe("end-to-end encryption", () => {
  const secret = { idea: { name: "ClinicQ" }, revenue: [{ amount: 1499 }], notes: "do not leak" };

  test("a workspace only opens with its own key and owner", async () => {
    const { key, recovery } = await createKey();
    const sealed = await seal(key, secret, "user-1");
    expect(isSealed(sealed)).toBe(true);
    expect(JSON.stringify(sealed)).not.toContain("ClinicQ");
    expect(JSON.stringify(sealed)).not.toContain("do not leak");

    expect(await open(key, sealed, "user-1")).toEqual(secret);
    // The recovery key rebuilds the same key on another device.
    expect(await open(await keyFromRecovery(recovery), sealed, "user-1")).toEqual(secret);

    const other = await createKey();
    await expect(open(other.key, sealed, "user-1")).rejects.toBeInstanceOf(WrongKeyError);
    // Moving the ciphertext to another account doesn't work either.
    await expect(open(key, sealed, "user-2")).rejects.toBeInstanceOf(WrongKeyError);
  });

  test("tampering is detected", async () => {
    const { key } = await createKey();
    const sealed = await seal(key, secret, "u");
    const bytes = Uint8Array.from(atob(sealed.ct), (c) => c.charCodeAt(0));
    bytes[0] ^= 1;
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    await expect(open(key, { ...sealed, ct: btoa(s) }, "u")).rejects.toBeInstanceOf(WrongKeyError);
  });

  test("every save uses a fresh IV", async () => {
    const { key } = await createKey();
    const a = await seal(key, secret, "u");
    const b = await seal(key, secret, "u");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });

  test("recovery keys round-trip and forgive typing", () => {
    const raw = crypto.getRandomValues(new Uint8Array(32));
    const code = formatRecovery(raw);
    expect(code.replace(/-/g, "")).toHaveLength(52);
    expect(parseRecovery(code)).toEqual(raw);
    expect(parseRecovery(code.toLowerCase().replace(/-/g, " "))).toEqual(raw);
    expect(parseRecovery(code.replace(/0/g, "O").replace(/1/g, "I"))).toEqual(raw);
    expect(() => parseRecovery("ABCD-1234")).toThrow();
  });
});

describe("content-free reminders", () => {
  const s = {
    profile: { name: "Aarav Mehta", email: "a@x.com", createdAt: "2026-10-01" },
    idea: { name: "SecretStartup" },
    startDate: "2026-10-20",
    tasks: [
      { title: "Call Dr. Shah about pricing", due: "2026-11-01", done: false },
      { title: "Ship analytics", due: "2026-11-03", done: false },
      { title: "Done thing", due: "2026-10-25", done: true, doneAt: "2026-10-25" },
    ],
    checkIns: [{ submittedAt: "2026-10-31" }],
    revenue: [],
    leads: [{ name: "Dr. Meera Rao", stage: "demo", updatedAt: "2026-10-20" }],
    interviews: [],
    penalties: [],
    decisions: [],
    killCriteria: null,
    notify: { email: true, partnerEmail: "" },
  } as unknown as AppState;

  test("the facts the server sees contain no names, titles or amounts", () => {
    const f = reminderFacts(s)!;
    const json = JSON.stringify(f);
    for (const word of ["Aarav", "SecretStartup", "Dr. Shah", "analytics", "Meera", "a@x.com"]) expect(json).not.toContain(word);
    expect(f.openDue).toEqual(["2026-11-01", "2026-11-03"]);
  });

  test("reminders still fire from facts alone, and stay generic", () => {
    const n = nudgesFromFacts(reminderFacts(s)!, "2026-11-02", "scale");
    const kinds = n.map((x) => x.kind);
    expect(kinds).toContain("overdue");
    expect(kinds).toContain("due-tomorrow");
    expect(kinds).toContain("brief");
    const text = JSON.stringify(n);
    expect(text).not.toContain("Dr. Shah");
    expect(text).not.toContain("SecretStartup");
    expect(n.find((x) => x.kind === "brief")!.body).toContain("1 lead in play, 1 gone cold");
  });

  test("Garage and Launch don't get the morning brief", () => {
    expect(nudgesFromFacts(reminderFacts(s)!, "2026-11-02", "launch").some((x) => x.kind === "brief")).toBe(false);
  });
});
