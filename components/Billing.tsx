"use client";

import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { announceLimit, authHeaders } from "@/lib/cloud";
import { fmtDate } from "@/lib/engine";
import { money } from "@/lib/locale";
import { atLeast, billingProviderFor, nextTierFor, QUOTA_LABEL, tier, TIERS, type PlanId, type QuotaKind } from "@/lib/plans";
import { isNativeApp } from "@/lib/platform";
import { useStore } from "@/lib/store";
import { useBilling } from "@/lib/usePlan";
import { Modal, ProgressBar, cx } from "./ui";

const priceLabel = (id: PlanId, country: string) => {
  const t = tier(id);
  if (!t.price.INR) return "Free";
  return country === "IN" ? `${money(t.price.INR, { country: "IN", currency: "INR", locale: "en-IN" })}/mo` : `$${t.price.USD}/mo`;
};

export const openPlans = (suggest?: PlanId) => announceLimit({ suggest: suggest ?? null });

/** Plan, today's usage and billing controls, shown in Settings. */
export function PlanSection() {
  const { dispatch } = useStore();
  const { status, plan, refresh } = useBilling();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (status === undefined) return <div className="border-t border-line pt-5 text-sm text-muted">Loading plan…</div>;
  if (status === null || !plan) {
    return (
      <div className="space-y-2 border-t border-line pt-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">Plan</p>
          <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => openPlans()}>See plans</button>
        </div>
        <p className="text-xs text-muted">Plans and billing run in the full STARTIT app. This preview uses your own Claude account, with every feature unlocked.</p>
      </div>
    );
  }
  const limits = status.limits ?? tier(plan).limits;
  const cancelling = plan !== "garage" && ["canceled", "cancelled"].includes(status.status ?? "");

  const manage = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/billing/manage", { method: "POST", headers: await authHeaders() });
      const b = (await r.json().catch(() => ({}))) as { url?: string; cancelled?: boolean; error?: string };
      if (!r.ok) throw new Error(b.error ?? `Failed (${r.status})`);
      if (b.url) window.location.href = b.url;
      else {
        dispatch({ type: "TOAST", tone: "ok", text: `Cancelled. You keep ${tier(plan).name} until the end of this billing period.` });
        setConfirmCancel(false);
        void refresh();
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 border-t border-line pt-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">
            {tier(plan).name} plan{status.dev && " (developer mode, no limits)"}
          </p>
          <p className="text-xs text-muted">
            {plan !== "garage" && status.periodEnd ? `${cancelling ? "Ends" : "Renews"} ${fmtDate(status.periodEnd.slice(0, 10))}` : tier(plan).tagline}
          </p>
        </div>
        {plan !== "scale" && !isNativeApp() && (
          <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => openPlans(nextTierFor(plan) ?? undefined)}>
            Upgrade
          </button>
        )}
      </div>
      {!status.dev && (
        <ul className="space-y-2.5">
          {(Object.keys(QUOTA_LABEL) as QuotaKind[])
            .filter((k) => limits[k] > 0)
            .map((k) => {
              const used = status.usage?.[k] ?? 0;
              return (
                <li key={k}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-muted">{QUOTA_LABEL[k]} today</span>
                    <span className={cx("tnum", used >= limits[k] && "text-flame")}>
                      {used}/{limits[k]}
                    </span>
                  </div>
                  <ProgressBar value={(used / limits[k]) * 100} tone={used >= limits[k] ? "flame" : undefined} className="h-1" />
                </li>
              );
            })}
        </ul>
      )}
      {isNativeApp() && <p className="text-xs text-muted">Your plan is managed in your STARTIT account.</p>}
      {plan !== "garage" && !status.dev && !cancelling && !isNativeApp() &&
        (status.provider === "razorpay" ? (
          !confirmCancel ? (
            <button className="text-xs text-muted hover:text-ink" onClick={() => setConfirmCancel(true)}>Cancel subscription</button>
          ) : (
            <div className="rounded-lg border border-line p-3 text-xs">
              <p>Cancel {tier(plan).name}? You keep it until the end of the period you&apos;ve paid for, then move to Garage.</p>
              <div className="mt-2 flex gap-2">
                <button className="btn-danger px-2.5 py-1 text-xs" disabled={busy} onClick={manage}>Cancel plan</button>
                <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => setConfirmCancel(false)}>Keep it</button>
              </div>
            </div>
          )
        ) : (
          <button className="btn-ghost text-xs" disabled={busy} onClick={manage}>Manage billing</button>
        ))}
      {err && <p className="text-xs text-flame">{err}</p>}
    </div>
  );
}

/** The plans screen. Opens on "Upgrade", on any limit hit, and on locked features. Also handles the return from checkout. */
export function UpgradeHost() {
  const { state, dispatch } = useStore();
  const { status, plan } = useBilling();
  const [open, setOpen] = useState<{ kind?: string; limit?: number; message?: string; suggest?: PlanId | null } | null>(null);
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const country = state.prefs.country;
  const provider = billingProviderFor(country);

  useEffect(() => {
    const on = (e: Event) => {
      setErr(null);
      setOpen((e as CustomEvent).detail ?? {});
    };
    window.addEventListener("startit:limit", on);
    return () => window.removeEventListener("startit:limit", on);
  }, []);

  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const b = p.get("billing");
      if (!b) return;
      dispatch({ type: "TOAST", tone: b === "success" ? "ok" : "warn", text: b === "success" ? "Payment confirmed. Your new plan is active." : "Checkout cancelled. Nothing was charged." });
      window.dispatchEvent(new Event("startit:billing"));
      p.delete("billing");
      history.replaceState(null, "", `${location.pathname}${p.toString() ? `?${p}` : ""}${location.hash}`);
    } catch {}
  }, [dispatch]);

  const buy = async (id: PlanId) => {
    setBusy(id);
    setErr(null);
    try {
      const r = await fetch("/api/billing/checkout", { method: "POST", headers: { "content-type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ country, tier: id }) });
      const b = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!r.ok || !b.url) throw new Error(b.error ?? `Checkout failed (${r.status})`);
      window.location.href = b.url;
    } catch (e) {
      setErr((e as Error).message);
      setBusy(null);
    }
  };

  const current: PlanId = plan ?? "garage";
  const suggested = open?.suggest ?? (plan ? nextTierFor(plan) : "launch");
  const kind = open?.kind as QuotaKind | undefined;
  // Store apps: Apple and Google require their own billing for subscriptions sold in the app, so
  // the app shows no prices or checkout. Limits still apply; plans are managed on the web account.
  if (isNativeApp()) {
    return (
      <Modal open={!!open} onClose={() => setOpen(null)} title={kind ? "Daily limit reached" : "Not in your plan"} top>
        <div className="space-y-4">
          <p className="text-sm text-muted">
            {open?.message ?? "This isn't included in your current plan."}
            {kind && open?.limit ? " Limits reset at midnight UTC." : ""}
          </p>
          <div className="flex justify-end">
            <button className="btn-primary" onClick={() => setOpen(null)}>OK</button>
          </div>
        </div>
      </Modal>
    );
  }
  const purchasable = (id: PlanId) => id !== "garage" && !!status && !!status.billing?.[provider]?.[id as "launch" | "scale"];

  return (
    <Modal open={!!open} onClose={() => setOpen(null)} title={open?.message ? "Unlock more" : "Plans"} wide top>
      <div className="space-y-4">
        {open?.message && (
          <p className="text-sm text-muted">
            {open.message}
            {kind && open.limit ? " Limits reset at midnight UTC." : ""}
          </p>
        )}
        <div className="grid gap-3 md:grid-cols-3">
          {TIERS.map((t) => {
            const isCurrent = plan != null && t.id === current;
            const rec = t.id === suggested && !isCurrent;
            const below = plan != null && atLeast(current, t.id) && !isCurrent;
            return (
              <div key={t.id} className={cx("flex flex-col rounded-xl border p-4", rec ? "border-ink" : "border-line")}>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{t.name}</p>
                  {isCurrent ? (
                    <span className="rounded-full bg-abyss px-2 py-0.5 text-[11px] text-muted">Current</span>
                  ) : rec ? (
                    <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] text-obsidian">Recommended</span>
                  ) : null}
                </div>
                <p className="tnum mt-1 text-xl font-semibold tracking-tight">{priceLabel(t.id, country)}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">{t.tagline}</p>
                <ul className="mt-3 flex-1 space-y-1.5 text-[13px]">
                  {t.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span className={f.startsWith("Everything in") ? "font-medium" : ""}>{f}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4">
                  {t.id === "garage" ? (
                    <p className="text-center text-xs text-muted">{isCurrent ? "You're here" : "Always free"}</p>
                  ) : isCurrent || below ? (
                    <p className="text-center text-xs text-muted">{isCurrent ? "You're here" : "Included in your plan"}</p>
                  ) : status === null ? (
                    <p className="text-center text-xs text-muted">Available in the full app</p>
                  ) : (
                    <button className={cx("w-full", rec ? "btn-primary" : "btn-ghost")} disabled={!!busy || !purchasable(t.id)} onClick={() => buy(t.id)}>
                      {busy === t.id ? "Opening checkout…" : purchasable(t.id) ? `Choose ${t.name}` : "Not set up yet"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted">
          {provider === "razorpay" ? "Pay with UPI, cards or netbanking through Razorpay." : "Pay by card through Stripe."} Cancel any time and keep your plan until the end of the period.
          {plan === "launch" && " Moving to Scale replaces Launch, so you're never billed for both."}
        </p>
        {err && <p className="text-sm text-flame">{err}</p>}
      </div>
    </Modal>
  );
}
