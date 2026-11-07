/** Small helpers shared by the auth routes. */
import { cloudReady } from "./guard";
import { sameOrigin } from "./session";

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

/** Reads a small JSON body (16 KB max for auth requests). */
export async function readBody<T extends Record<string, unknown>>(req: Request, max = 16_384): Promise<T | null> {
  const text = await req.text().catch(() => "");
  if (text.length > max) return null;
  try {
    const v = JSON.parse(text || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? (v as T) : null;
  } catch {
    return null;
  }
}

/** STARTIT has no passwords. Refuse any request that tries to set or use one. */
export const hasPassword = (body: Record<string, unknown>) => Object.keys(body).some((k) => /pass(word)?|pwd/i.test(k));

export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

/** Common checks for every auth route. Returns a Response to send back if the request must stop. */
export function preflight(req: Request, body: Record<string, unknown> | null): Response | null {
  if (!cloudReady()) return json({ error: "Accounts aren't set up on this server.", code: "not_configured" }, 503);
  if (!sameOrigin(req)) return json({ error: "Request refused.", code: "bad_origin" }, 403);
  if (!body) return json({ error: "Invalid request.", code: "bad_request" }, 400);
  if (hasPassword(body)) return json({ error: "STARTIT doesn't use passwords. Sign in with the code we email you.", code: "no_passwords" }, 400);
  return null;
}
