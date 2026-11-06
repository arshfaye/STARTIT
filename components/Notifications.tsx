"use client";

import { Bell } from "lucide-react";
import { useMemo, useState } from "react";
import { today } from "@/lib/engine";
import { nudgesFor } from "@/lib/nudges";
import { useStore } from "@/lib/store";
import { useBilling } from "@/lib/usePlan";
import { cx } from "./ui";

/**
 * In-app notifications. Uses the exact same rules as the push/email reminder job, so what the
 * founder sees here is what their phone would buzz with.
 */
export function NotificationBell() {
  const { state, dispatch } = useStore();
  const { plan } = useBilling();
  const [open, setOpen] = useState(false);
  const day = today();
  // No server (preview) → everything unlocked, so the Scale morning brief shows too.
  const tierForBell = plan === null ? "scale" : (plan ?? "garage");
  const items = useMemo(() => nudgesFor(state, day, tierForBell).filter((n) => n.to === "founder"), [state, day, tierForBell]);
  const keyOf = (kind: string) => `${kind}:${day}`;
  const unread = items.filter((n) => !state.seenNotifs.includes(keyOf(n.kind))).length;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && unread) dispatch({ type: "NOTIFS_SEEN", keys: items.map((n) => keyOf(n.kind)) });
  };

  return (
    <div className="relative">
      <button onClick={toggle} aria-label={unread ? `${unread} new notifications` : "Notifications"} aria-expanded={open} className="relative rounded-lg p-2 text-muted transition hover:bg-abyss hover:text-ink">
        <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} />
        {unread > 0 && <span className="tnum absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-flame px-1 text-[10px] font-semibold leading-none text-white">{unread}</span>}
      </button>
      {open && (
        <>
          <button aria-label="Close notifications" className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div role="dialog" aria-label="Notifications" className="absolute right-0 z-50 mt-2 w-[min(360px,calc(100vw-32px))] animate-rise overflow-hidden rounded-xl border border-line bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="text-sm font-semibold">Notifications</p>
              <span className="text-xs text-muted">{items.length ? `${items.length} today` : "All clear"}</span>
            </div>
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted">Nothing needs you right now. Go sell something.</p>
            ) : (
              <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">
                {items.map((n) => (
                  <li key={n.kind}>
                    <button
                      className="w-full px-4 py-3 text-left transition hover:bg-abyss"
                      onClick={() => {
                        setOpen(false);
                        dispatch({ type: "SET_TAB", tab: n.tab });
                      }}
                    >
                      <p className={cx("text-sm font-medium", (n.kind === "overdue" || n.kind === "decision") && "text-flame")}>{n.subject}</p>
                      <p className="mt-0.5 line-clamp-3 whitespace-pre-line text-xs leading-relaxed text-muted">{n.body}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
