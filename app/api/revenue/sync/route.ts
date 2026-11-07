/**
 * POST /api/revenue/sync?provider=stripe|razorpay
 * Pulls the last 100 successful payments from the provider and returns them as RevenueEntry[].
 * The client de-duplicates by provider id, so syncing twice is safe.
 *
 * Env:
 *   STRIPE_SECRET_KEY                      (a restricted key with read access to Charges is enough)
 *   RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET
 *
 * Admin-only: the keys in .env.local are the operator's own accounts, so only ADMIN_EMAILS can sync.
 * To let every founder sync their own payments, add Stripe Connect / Razorpay OAuth per user.
 */
import { getCaller, isAdmin, requireAdmin } from "@/lib/server/guard";
import type { RevenueEntry } from "@/lib/types";

export const runtime = "nodejs";

// Currencies whose API amounts are already in major units.
const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "BIF", "DJF", "GNF", "KMF", "MGA", "PYG", "RWF", "UGX", "VUV", "XAF", "XOF", "XPF"]);
const THREE_DECIMAL = new Set(["KWD", "BHD", "OMR", "JOD", "TND"]);
const toMajor = (minor: number, currency: string) =>
  ZERO_DECIMAL.has(currency) ? minor : THREE_DECIMAL.has(currency) ? minor / 1000 : minor / 100;
const isoDate = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString().slice(0, 10);

async function stripe(): Promise<RevenueEntry[]> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new HttpError(501, "Add STRIPE_SECRET_KEY to .env.local to sync Stripe.");
  const res = await fetch("https://api.stripe.com/v1/charges?limit=100", { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new HttpError(502, `Stripe returned ${res.status}`);
  const body = (await res.json()) as {
    data: { id: string; amount: number; amount_refunded: number; currency: string; created: number; paid: boolean; status: string; invoice: string | null; billing_details?: { email?: string; name?: string }; receipt_email?: string; description?: string }[];
  };
  return body.data
    .filter((c) => c.paid && c.status === "succeeded" && c.amount > c.amount_refunded)
    .map((c) => {
      const currency = c.currency.toUpperCase();
      return {
        id: `stripe-${c.id}`,
        extId: c.id,
        date: isoDate(c.created),
        amount: toMajor(c.amount - c.amount_refunded, currency),
        currency,
        customer: c.billing_details?.name || c.billing_details?.email || c.receipt_email || "Stripe customer",
        kind: c.invoice ? "subscription" : "one-time",
        source: "stripe",
        note: c.description || undefined,
      };
    });
}

async function razorpay(): Promise<RevenueEntry[]> {
  const id = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!id || !secret) throw new HttpError(501, "Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env.local to sync Razorpay.");
  const auth = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/payments?count=100", { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) throw new HttpError(502, `Razorpay returned ${res.status}`);
  const body = (await res.json()) as {
    items: { id: string; amount: number; amount_refunded: number; currency: string; created_at: number; status: string; email?: string; contact?: string; invoice_id?: string | null; description?: string }[];
  };
  return body.items
    .filter((p) => p.status === "captured" && p.amount > p.amount_refunded)
    .map((p) => {
      const currency = p.currency.toUpperCase();
      return {
        id: `rzp-${p.id}`,
        extId: p.id,
        date: isoDate(p.created_at),
        amount: toMajor(p.amount - p.amount_refunded, currency),
        currency,
        customer: p.email || p.contact || "Razorpay customer",
        kind: p.invoice_id ? "subscription" : "one-time",
        source: "razorpay",
        note: p.description || undefined,
      };
    });
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Probe: lets the app check that sync exists here and which providers have keys. */
export async function GET(req: Request) {
  // Only admins see sync as available: these keys belong to the person who runs this server.
  const caller = await getCaller(req);
  const admin = !!caller && isAdmin(caller);
  return Response.json({ ok: true, stripe: admin && !!process.env.STRIPE_SECRET_KEY, razorpay: admin && !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET), adminOnly: !admin });
}

export async function POST(req: Request) {
  // The server's Stripe/Razorpay keys are the operator's own accounts. Never let other users read them.
  // Admin middleware: on the admin list, and two-step verification completed in this session.
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const provider = new URL(req.url).searchParams.get("provider");
  try {
    const entries = provider === "stripe" ? await stripe() : provider === "razorpay" ? await razorpay() : null;
    if (!entries) return Response.json({ error: "provider must be stripe or razorpay" }, { status: 400 });
    return Response.json({ entries });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return Response.json({ error: (e as Error).message }, { status });
  }
}
