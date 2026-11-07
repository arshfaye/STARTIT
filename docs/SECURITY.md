# Security

How STARTIT protects accounts, and the settings you must switch on before real users sign up.

## How sign-in works

STARTIT has **no passwords**. You sign in with a 6-digit code (or link) sent to your email, and optionally a second step with an authenticator app.

```
Browser ──► /api/auth/otp      (send code)        ─┐
        ──► /api/auth/verify   (check code)        │  rate limits, lockout, CAPTCHA,
        ──► /api/auth/mfa/*    (authenticator)     │  attempt log  (lib/server/ratelimit.ts)
        ──► /api/auth/confirm  (email link)       ─┘
                    │
                    ▼  server talks to Supabase Auth, then sets cookies:
        __Host-startit-at / __Host-startit-rt   httpOnly · Secure · SameSite=Strict · Path=/
```

- **Tokens never reach page JavaScript.** The browser no longer loads the Supabase client at all. Every API route reads the session from the httpOnly cookies (`lib/server/session.ts`), refreshes it when it's about to expire, and checks it with Supabase on every request, so a revoked session stops working immediately.
- **CSRF:** SameSite=Strict cookies, plus every state-changing request must carry an `Origin` from this site (`sameOrigin`). A bearer token in a header is ignored.
- **XSS:** a strict Content-Security-Policy (`next.config.mjs`): scripts, requests, fonts and images only from this site (Cloudflare Turnstile excepted), no framing, no plugins. Next.js needs `'unsafe-inline'` for its own bootstrap scripts; moving to nonces is the next hardening step.
- **The Supabase anon key is server-only** (`SUPABASE_ANON_KEY`). It's no longer shipped to browsers, so attackers can't easily call Supabase Auth directly to get around STARTIT's limits.
- **Workspaces are end-to-end encrypted** in the browser (`lib/vault.ts`), and `/api/workspace` refuses to store anything that isn't ciphertext.

## Two-step verification (TOTP)

- Settings → Two-step verification: scan a QR code with any authenticator app, confirm a code, then save 10 **backup codes**.
- Backup codes are random (about 49 bits each), stored only as salted HMACs (`mfa_backup_codes`), and work once. Using one removes the authenticator so the owner can sign in and set it up again.
- When an account has an authenticator, the server treats sessions that haven't passed it as signed out, and the database enforces the same rule (restrictive RLS policies using `mfa_satisfied()`).
- **Admins must use 2FA.** `requireAdmin()` (`lib/server/guard.ts`) runs on every admin route: signed in, on `ADMIN_EMAILS`, and 2FA completed this session. Admins can't turn 2FA off.

## Brute-force protection

Applies to sending codes, checking codes, sign-in links, authenticator codes and backup codes.

| Rule | Value |
| --- | --- |
| Per IP | 5 attempts per action per 15 minutes |
| CAPTCHA (Cloudflare Turnstile) | after 3 failures in 15 minutes, from that IP or on that account |
| Account lockout | after 5 failures in 24 hours: 15 min, then 30, 60… up to 24 hours |
| Slow-down on wrong answers | 250 ms, doubling, up to 4 s |
| Email code expiry | 10 minutes (enforced by STARTIT, and set the same in Supabase) |
| Logging | every attempt to `auth_events` (IP stored only as a keyed hash), failures to the server log; kept 30 days |

Refused requests (rate-limited, locked, missing CAPTCHA) are logged but don't count toward lockout, so nobody can keep another person's account locked by hammering it. If the attempt log can't be read, sign-in fails closed.

## Passwords

There are none, and the API refuses any request that includes a password field. Because Supabase's own Auth API could still accept a password if someone called it directly, set Supabase's password rules anyway (below), so even that path would require a strong, non-leaked password.

## Settings to switch on (required before launch)

**Vercel environment variables**
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_ANON_KEY` (rename from `NEXT_PUBLIC_SUPABASE_ANON_KEY` if you set that before, then rotate the key in Supabase), `SUPABASE_SERVICE_ROLE_KEY`
- `AUTH_HASH_SECRET`: a long random string (`openssl rand -hex 32`)
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`: free at Cloudflare → Turnstile. Without them, sign-in falls back to a 15-minute lockout instead of a CAPTCHA.
- `ADMIN_EMAILS`

**Supabase dashboard**
1. SQL editor: run `supabase/schema.sql` again (adds `auth_events`, `mfa_backup_codes`, the 2FA policies).
2. Authentication → Sign In / Providers → Email:
   - Email OTP expiration: **600** seconds.
   - Minimum password length **12**; required characters: lowercase, uppercase, digits and symbols.
   - Turn on **leaked password protection** (checks HaveIBeenPwned; Pro plan).
3. Authentication → Multi-Factor: **TOTP enabled**.
4. Authentication → Rate Limits: lower the email and verification limits to what a real person needs.
5. Authentication → URL Configuration: add `https://yourdomain.com/app` to the redirect URLs.
6. Authentication → Email Templates → Magic Link: point the link at the server and include the code:
   ```html
   <p>Your STARTIT code: <b>{{ .Token }}</b> (valid 10 minutes)</p>
   <p><a href="{{ .SiteURL }}/api/auth/confirm?token_hash={{ .TokenHash }}&type=email">Sign in</a></p>
   ```

## Checks

`bun test` covers cookie attributes, CSRF refusal, header tokens being ignored, IP limits, CAPTCHA after 3 failures, exponential lockout, refusals not extending lockouts, OTP expiry, password refusal, backup-code hashing, the admin middleware, and the encrypted-only storage rule.
