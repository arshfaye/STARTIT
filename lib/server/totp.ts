/** Authenticator-app (TOTP) factors through Supabase Auth's MFA API, on the user's own session. */
import { gotrue, setSession, type SessionUser, type Tokens } from "./session";

export interface Enrollment {
  factorId: string;
  qr: string; // SVG data URI
  secret: string;
  uri: string;
}

export async function enrollTotp(u: SessionUser): Promise<Enrollment> {
  // Clear half-finished setups first: Supabase allows only a few unverified factors.
  for (const f of u.factors.filter((f) => f.status !== "verified")) {
    await gotrue(`factors/${f.id}`, { method: "DELETE", token: u.accessToken }).catch(() => {});
  }
  const r = await gotrue<{ id?: string; totp?: { qr_code: string; secret: string; uri: string }; msg?: string }>("factors", {
    method: "POST",
    token: u.accessToken,
    body: JSON.stringify({ factor_type: "totp", friendly_name: `STARTIT ${new Date().toISOString().slice(0, 10)}`, issuer: "STARTIT" }),
  });
  if (!r.ok || !r.body.id || !r.body.totp) throw new Error(r.body.msg || `Couldn't start setup (${r.status})`);
  return { factorId: r.body.id, qr: r.body.totp.qr_code, secret: r.body.totp.secret, uri: r.body.totp.uri };
}

/** Checks a 6-digit code against a factor. On success the session is upgraded to aal2 (new cookies). */
export async function verifyTotp(u: SessionUser, factorId: string, code: string): Promise<boolean> {
  if (!u.factors.some((f) => f.id === factorId)) return false;
  const ch = await gotrue<{ id?: string }>(`factors/${factorId}/challenge`, { method: "POST", token: u.accessToken, body: "{}" });
  if (!ch.ok || !ch.body.id) return false;
  const v = await gotrue<Tokens>(`factors/${factorId}/verify`, { method: "POST", token: u.accessToken, body: JSON.stringify({ challenge_id: ch.body.id, code }) });
  if (!v.ok || !v.body.access_token) return false;
  await setSession(v.body);
  return true;
}

export async function deleteTotp(u: SessionUser, factorId: string): Promise<boolean> {
  const r = await gotrue(`factors/${factorId}`, { method: "DELETE", token: u.accessToken });
  return r.ok;
}
