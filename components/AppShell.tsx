"use client";

import { Bot, CalendarRange, Crosshair, Gauge, Megaphone, Menu, Search, Settings, Trophy, Users, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { today } from "@/lib/engine";
import { StoreProvider, useStore } from "@/lib/store";
import type { TabId } from "@/lib/types";
import { Logo, Onboarding, SettingsPanel } from "./Onboarding";
import { RecoveryKeyDialog, UnlockScreen } from "./Vault";
import { MfaChallenge } from "./Security";
import { GradeBadge, Modal, cx } from "./ui";
import { Accountability } from "./views/Accountability";
import { Cofounder } from "./views/Cofounder";
import { Revenue } from "./views/Revenue";
import { Research } from "./views/Research";
import { Customers } from "./views/Customers";
import { DecisionBanner } from "./Decision";
import { NotificationBell } from "./Notifications";
import { UpgradeHost } from "./Billing";
import { isNativeApp } from "@/lib/platform";
import { IdeaAudit } from "./views/IdeaAudit";
import { LaunchKit } from "./views/LaunchKit";
import { Ledger } from "./views/Ledger";
import { Timetable } from "./views/Timetable";

type TabDef = { id: TabId; label: string; short: string; icon: typeof Crosshair; title: string; sub: string; group: string };
const TABS: TabDef[] = [
  { id: "cofounder", group: "", label: "Co-founder", short: "Ask", icon: Bot, title: "Your AI co-founder", sub: "Reads everything in STARTIT and tells you what to do. No sugarcoating." },
  { id: "audit", group: "Validate", label: "Idea Audit", short: "Audit", icon: Crosshair, title: "Idea Audit & Kill Score", sub: "Find out if anyone actually needs this before you build it." },
  { id: "research", group: "Validate", label: "Market Research", short: "Research", icon: Search, title: "Market research", sub: "Real posts and reviews from Hacker News, the App Store, Stack Exchange and Bluesky. Real pains, real quotes." },
  { id: "timetable", group: "Execute", label: "Timetable", short: "Plan", icon: CalendarRange, title: "Execution timetable", sub: "Your plan, rebuilt every week from what actually happened. Miss a deadline and it costs you." },
  { id: "customers", group: "Execute", label: "Customers", short: "Sales", icon: Users, title: "Customers", sub: "Every lead and every conversation. Selling is the job." },
  { id: "revenue", group: "Execute", label: "Revenue", short: "Money", icon: Wallet, title: "Revenue", sub: "What customers actually paid you. The only number that can't be faked." },
  { id: "accountability", group: "Execute", label: "Accountability", short: "Grade", icon: Gauge, title: "Accountability & weekly grading", sub: "Sunday check-ins, letter grades, kill criteria and real consequences." },
  { id: "launch", group: "Grow", label: "Launch Kit", short: "Launch", icon: Megaphone, title: "Day-1 early-adopter launch kit", sub: "Where your first users are, and exactly what to post." },
  { id: "ledger", group: "Grow", label: "Success Ledger", short: "Ledger", icon: Trophy, title: "Success ledger & investor passport", sub: "Proof of execution, misses included." },
];
const MOBILE_TABS: TabId[] = ["cofounder", "timetable", "customers", "revenue"];

const TAB_IDS = TABS.map((t) => t.id);

function Gate() {
  const { state, vault, mfaNeeded } = useStore();
  // Store app: lets CSS keep the header clear of the notch and status bar.
  useEffect(() => {
    if (isNativeApp()) document.documentElement.classList.add("native");
  }, []);
  if (mfaNeeded) return <MfaChallenge />;
  if (vault.locked) return <UnlockScreen />;
  if (!state.ready) return <div className="grid min-h-screen place-items-center text-sm text-muted">Loading…</div>;
  if (!state.profile)
    return (
      <>
        <Onboarding />
        <RecoveryKeyDialog />
        <Toast />
      </>
    );
  return (
    <>
      <Shell />
      <RecoveryKeyDialog />
    </>
  );
}

function Shell() {
  const { state, dispatch, exec } = useStore();
  const [settings, setSettings] = useState(false);
  const [more, setMore] = useState(false);
  const active = TABS.find((t) => t.id === state.tab)!;
  const now = today();
  const overdue = state.tasks.filter((t) => !t.done && t.due < now).length;

  // Keep the active tab in the URL hash so views are linkable.
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.slice(1) as TabId;
      if (TAB_IDS.includes(h)) dispatch({ type: "SET_TAB", tab: h });
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [dispatch]);

  const go = (tab: TabId) => {
    dispatch({ type: "SET_TAB", tab });
    try {
      history.replaceState(null, "", `#${tab}`);
    } catch {}
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex max-w-[1280px]">
        {/* Sidebar (desktop) */}
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line px-3 py-4 lg:flex">
          <div className="px-2 pb-6">
            <Logo />
          </div>
          <nav aria-label="Sections">
            <ul className="space-y-0.5">
              {TABS.map((t, idx) => {
                const Icon = t.icon;
                const on = state.tab === t.id;
                const groupStart = t.group && TABS[idx - 1]?.group !== t.group;
                return (
                  <li key={t.id} className={groupStart ? "pt-4" : ""}>
                    {groupStart && <p className="px-2.5 pb-1 text-[11px] font-medium text-muted">{t.group}</p>}
                    <button
                      onClick={() => go(t.id)}
                      aria-current={on ? "page" : undefined}
                      className={cx(
                        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition",
                        on ? "bg-abyss font-medium text-ink" : "text-muted hover:bg-abyss hover:text-ink",
                      )}
                    >
                      <Icon className="h-4 w-4" strokeWidth={1.75} />
                      <span className="flex-1">{t.label}</span>
                      {t.id === "accountability" && overdue > 0 && (
                        <span className="tnum rounded-full bg-flame px-1.5 text-[10px] font-semibold leading-4 text-white">{overdue}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="mt-auto space-y-3 px-2">
            <p className="text-xs leading-relaxed text-muted">
              Missed deadlines move back 14 days and cost 35 points.
              {state.penalties.length > 0 && <span className="text-flame"> {state.penalties.length} penalty so far.</span>}
            </p>
            <button
              onClick={() => setSettings(true)}
              className="flex w-full items-center gap-2.5 rounded-lg border-t border-line px-1 pt-3 text-left transition hover:opacity-80"
              aria-label="Open settings"
            >
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-abyss text-xs font-semibold">{state.profile?.name.slice(0, 1).toUpperCase()}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{state.profile?.name}</p>
                <p className="truncate text-xs text-muted">
                  {state.idea.name || "No startup yet"} · {state.prefs.currency}
                </p>
              </div>
              <Settings className="h-4 w-4 shrink-0 text-muted" />
            </button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {/* Top bar */}
          <header className="app-header sticky top-0 z-30 border-b border-line bg-obsidian/95">
            <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-8">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex items-center gap-1 lg:hidden">
                  <Logo />
                  <button onClick={() => setSettings(true)} aria-label="Settings" className="ml-1 rounded-md p-1.5 text-muted hover:bg-abyss hover:text-ink">
                    <Settings className="h-4 w-4" />
                  </button>
                </div>
                <p className="hidden truncate text-sm text-muted lg:block">
                  {state.idea.name} <span className="px-1.5 text-line">/</span> <span className="text-ink">{active.label}</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <NotificationBell />
                {state.analysis && (
                  <button onClick={() => go("audit")} className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted transition hover:bg-abyss md:flex">
                    Kill score
                    <span className={cx("tnum font-semibold", state.analysis.killScore >= 66 ? "text-flame" : state.analysis.killScore >= 38 ? "text-amber" : "text-emerald")}>
                      {state.analysis.killScore}%
                    </span>
                  </button>
                )}
                {overdue > 0 && (
                  <button onClick={() => go("accountability")} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-flame transition hover:bg-abyss lg:hidden">
                    <span className="h-1.5 w-1.5 rounded-full bg-flame" /> {overdue} overdue
                  </button>
                )}
                <button onClick={() => go("accountability")} className="flex items-center gap-2 rounded-lg border border-line py-1 pl-1 pr-2.5 transition hover:bg-abyss">
                  <GradeBadge grade={exec.grade} size="sm" />
                  <span className="tnum text-sm font-medium">{exec.score}</span>
                </button>
              </div>
            </div>
          </header>

          <main className="px-4 pb-28 pt-8 sm:px-8 lg:pb-16">
            <DecisionBanner />
            <div key={state.tab} className="animate-rise">
              <div className="mb-8">
                <h1 className="text-2xl font-semibold tracking-tight [text-wrap:balance]">{active.title}</h1>
                <p className="mt-1 max-w-2xl text-sm text-muted">{active.sub}</p>
              </div>
              {state.tab === "audit" && <IdeaAudit />}
              {state.tab === "timetable" && <Timetable />}
              {state.tab === "accountability" && <Accountability />}
              {state.tab === "launch" && <LaunchKit />}
              {state.tab === "ledger" && <Ledger />}
              {state.tab === "cofounder" && <Cofounder />}
              {state.tab === "revenue" && <Revenue />}
              {state.tab === "research" && <Research />}
              {state.tab === "customers" && <Customers />}
            </div>
          </main>
        </div>
      </div>

      {/* Bottom tab bar (mobile/tablet) */}
      <nav aria-label="Sections" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-obsidian pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="mx-auto grid max-w-xl grid-cols-5">
          {MOBILE_TABS.map((id) => {
            const t = TABS.find((x) => x.id === id)!;
            const Icon = t.icon;
            const on = state.tab === t.id;
            return (
              <li key={t.id}>
                <button onClick={() => go(t.id)} aria-current={on ? "page" : undefined} className={cx("flex w-full flex-col items-center gap-1 py-2.5 text-[11px] transition", on ? "font-medium text-ink" : "text-muted")}>
                  <Icon className="h-5 w-5" strokeWidth={on ? 2 : 1.75} />
                  {t.short}
                </button>
              </li>
            );
          })}
          <li>
            <button onClick={() => setMore(true)} className={cx("flex w-full flex-col items-center gap-1 py-2.5 text-[11px] transition", !MOBILE_TABS.includes(state.tab) ? "font-medium text-ink" : "text-muted")}>
              <Menu className="h-5 w-5" strokeWidth={1.75} />
              More
            </button>
          </li>
        </ul>
      </nav>

      <Modal open={more} onClose={() => setMore(false)} title="All sections">
        <ul className="grid grid-cols-2 gap-2">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <li key={t.id}>
                <button
                  onClick={() => {
                    setMore(false);
                    go(t.id);
                  }}
                  className={cx("flex w-full items-center gap-2.5 rounded-lg border border-line px-3 py-3 text-left text-sm", state.tab === t.id ? "bg-abyss font-medium" : "hover:bg-abyss")}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.75} /> {t.label}
                </button>
              </li>
            );
          })}
        </ul>
      </Modal>

      <Modal open={settings} onClose={() => setSettings(false)} title="Settings">
        <SettingsPanel onClose={() => setSettings(false)} />
      </Modal>

      {/* Last, so the plans screen opens on top of Settings or any other window. */}
      <UpgradeHost />

      <Toast />
    </div>
  );
}

function Toast() {
  const { state } = useStore();
  if (!state.toast) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 lg:bottom-6">
      <div key={state.toast.id} role="status" className="pointer-events-auto flex animate-rise items-center gap-2.5 rounded-xl bg-ink px-4 py-2.5 text-sm text-obsidian shadow-lg">
        <span className={cx("h-1.5 w-1.5 rounded-full", state.toast.tone === "ok" ? "bg-emerald" : state.toast.tone === "warn" ? "bg-amber" : "bg-flame")} />
        {state.toast.text}
      </div>
    </div>
  );
}

export default function AppShell() {
  return (
    <StoreProvider>
      <Gate />
    </StoreProvider>
  );
}
