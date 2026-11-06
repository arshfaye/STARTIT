"use client";

import { useCallback, useEffect, useState } from "react";
import { announceLimit } from "./cloud";
import { atLeast, tier, type PlanId, type QuotaKind } from "./plans";
import { serverProbe } from "./research";

export interface BillingStatus {
  ok: boolean;
  signedIn: boolean;
  dev?: boolean;
  plan?: PlanId;
  status?: string | null;
  provider?: "stripe" | "razorpay" | null;
  periodEnd?: string | null;
  usage?: Partial<Record<QuotaKind, number>>;
  limits?: Record<QuotaKind, number>;
  billing: { stripe: { launch: boolean; scale: boolean }; razorpay: { launch: boolean; scale: boolean } };
}

let cache: Promise<BillingStatus | null> | null = null;
export function loadBilling(force = false) {
  if (force || !cache) cache = serverProbe<BillingStatus>("/api/billing/status").then((s) => (s?.ok ? s : null));
  return cache;
}

/**
 * The founder's plan.
 *   undefined → still loading
 *   null      → no STARTIT server here (the Claude preview): nothing is gated, AI runs on the viewer's own account
 *   PlanId    → enforce
 */
export function useBilling() {
  const [status, setStatus] = useState<BillingStatus | null | undefined>(undefined);
  const refresh = useCallback(() => loadBilling(true).then(setStatus), []);
  useEffect(() => {
    let alive = true;
    loadBilling().then((s) => alive && setStatus(s));
    const on = () => loadBilling(true).then((s) => alive && setStatus(s));
    window.addEventListener("startit:billing", on);
    return () => {
      alive = false;
      window.removeEventListener("startit:billing", on);
    };
  }, []);
  const plan: PlanId | null | undefined = status === undefined ? undefined : status === null ? null : (status.plan ?? "garage");
  return { status, refresh, plan };
}

/** True when the feature can be used; otherwise opens the plans screen pointing at `min`. */
export function ensurePlan(plan: PlanId | null | undefined, min: PlanId, message?: string): boolean {
  if (plan === null || plan === undefined || atLeast(plan, min)) return true;
  announceLimit({ suggest: min, message: message ?? `This is part of ${tier(min).name}.` });
  return false;
}
