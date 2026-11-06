# STARTIT technical guide

How each part of STARTIT works and how to configure it. For the overview, see the [README](../README.md); for shipping to the web and the app stores, see [LAUNCH.md](LAUNCH.md).

App state lives in a `useReducer` store (`lib/store.tsx`), saved to Supabase when it's configured and to browser storage otherwise, so the app also runs with no backend at all.

## Run it

```bash
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY to turn on the AI co-founder
npm run dev                  # http://localhost:3000
```

Screens are linkable: `/#cofounder`, `/#audit`, `/#research`, `/#timetable`, `/#customers`, `/#revenue`, `/#accountability`, `/#launch`, `/#ledger`.

## Structure

```
app/
  api/                  cofounder, research, revenue/sync, billing/*, account/delete, push/subscribe, cron/nudges
  privacy/, terms/      legal pages (drafts)
  layout.tsx            fonts, metadata, PWA manifest
components/
  AppShell.tsx          header, sidebar / mobile tab bar, notification bell, toasts
  Onboarding.tsx        sign-in, location, startup setup; Settings
  Billing.tsx           plans screen, usage meters, upgrade flow
  Decision.tsx          kill criteria and decision day
  views/                one file per screen (IdeaAudit, Research, Timetable, Customers, Revenue, Accountability, LaunchKit, Ledger, Cofounder)
lib/
  engine.ts             audit scoring, task plan, grading, penalties
  cofounder.ts          the AI co-founder: dossier, rules, streaming
  research.ts           signal collection and AI analysis
  revenue.ts            totals, MRR, CSV import
  locale.ts             countries, currencies, number and date formatting
  plans.ts              Garage / Launch / Scale definitions
  nudges.ts             reminder rules (bell, push, email, morning brief)
  server/               auth + quotas (guard.ts), billing, webhook mapping
supabase/schema.sql     tables, row-level security, atomic quota function
tests/                  bun test suites
native/, capacitor.config.ts   store-app shell
preview/                single-file build used for the Claude artifact preview
```

## How the scoring works

**Kill Score (0–100).** Starts from a category baseline (productivity and fitness are high, niche health is low), then adds points for buzzwords, a vague concept or an "everyone" audience, and subtracts points for a specific audience and a stated price. Under 38 is Open Niche, 38–65 Competitive, 66+ Heavily Saturated.

**Weekly check-in (0–1000).** 70% is goals hit vs. goals set. Interviews, signups and first revenue earn the remainder.

**Execution score (0–1000).** Tasks due so far that are done (480) + whole-roadmap completion (170) + average check-in score × 0.3 (300) + B-or-better streak (50), minus 35 points per penalised task. Grades: A+ ≥ 900, A ≥ 800, B+ ≥ 700, B ≥ 600, C ≥ 480, D ≥ 350, else F.

**Missed deadline.** Pushes every overdue, unfinished task back 14 days, marks it DELAYED (keeping the original date), logs a penalty event and deducts points. It can be triggered for all overdue tasks from the Accountability Hub or per task from the timetable.

## Onboarding, location and currency

New visitors go through three steps (`components/Onboarding.tsx`): account (name + email), location, and their startup (their own idea, which is audited immediately, or a sample workspace).

- **Location** is suggested from the browser's time zone, but the founder always chooses. The country sets the currency, number grouping and date format via `Intl` (`lib/locale.ts`), e.g. ₹1,25,000 in India, QAR 125,000 in Qatar, 125.000 € in Germany.
- **Currency can be overridden** separately (a Qatar founder billing in USD), and both can be changed later in Settings.
- Every money and date display reads from `lib/locale.ts`. The AI co-founder is told the founder's country and currency.
- **Accounts:** with Supabase configured, sign-in is a magic link and data lives in your database (see below). Without it, workspaces are stored per email in the browser, which is fine for demos but is not real authentication.

## Revenue

The Revenue screen (`components/views/Revenue.tsx`, `lib/revenue.ts`) is the single source of truth for money:

- **Log a payment** by hand: amount, date, customer, subscription or one-time.
- **Import a CSV** from Stripe, Razorpay or a bank statement. Columns are detected from the header row; failed, refunded and pending payments are skipped, refunds are netted out, and provider ids prevent double imports. Payments in another currency are listed but not added to totals.
- **Sync** from Stripe or Razorpay in the Next.js app (`app/api/revenue/sync/route.ts`). Add `STRIPE_SECRET_KEY` or `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` to `.env.local`. For many founders on one deployment, use Stripe Connect / Razorpay OAuth and store tokens per user instead.
- Totals: total, last 30 days, MRR (latest subscription charge per customer in 30 days), run rate and an 8-week chart.
- Weekly check-ins prefill revenue from the log. If a founder reports more than was logged, the difference is added to the log.

## Custom tasks

Founders can add tasks to any phase and delete any task. Deadlines lock once set. Deleting an overdue task is logged as a missed deadline: it costs 35 points and still counts as due-and-not-done, so deleting can never raise the score.

## AI co-founder

`lib/cofounder.ts` builds a dossier from live app state (idea, audit, every task with its status, check-ins, penalties, totals) and sends it with a strict set of rules: no sugarcoating, every claim tied to the founder's numbers, and every answer ends with **Do this next:**, 1–3 actions with deadlines.

- In the Next.js app it calls `POST /api/cofounder` (`app/api/cofounder/route.ts`), which streams from the Anthropic API. Set `ANTHROPIC_API_KEY`, and optionally `COFOUNDER_MODEL`.
- Inside a Claude artifact it uses the viewer's Claude account instead, so no key is needed there.
- Other screens can hand it a question with `dispatch({ type: "ASK_COFOUNDER", prompt })`.

## Market research (free sources)

`components/views/Research.tsx`, `lib/research.ts`, `app/api/research/route.ts`.

| Source | What it gives you | Setup |
| --- | --- | --- |
| Hacker News | Founder and builder discussions | None |
| App Store reviews | Reviews of the top 3 matching apps (your competitors) in the founder's country, worst first | None |
| Stack Exchange | “What tool does X?” questions (Software Recommendations, Web Apps, Stack Overflow) | None; free key raises the limit |
| Bluesky | Public posts | Free account + app password (search requires login) |

- **Reddit is not searched.** Reddit's terms require a paid contract to use its data in a commercial product, and its public API is closing. Founders can still paste posts they find themselves.
- **Paste posts** works everywhere, including the preview: threads, Play Store / G2 reviews, support emails. Blank lines separate posts.
- The AI clusters posts into pain themes with counts and **exact quotes**, willingness-to-pay evidence, current alternatives, an opening, and an evidence-based kill score. Quotes that don't point to a real collected post are dropped.
- Once research exists, the Idea Audit uses it. Without research, the audit is clearly labeled a pattern-based estimate.

## Customers

Sales pipeline (lead → contacted → replied → demo → paid / lost) with a funnel, conversion rates, the biggest leak and leads gone cold (7+ days). Marking a lead as paid offers to log the payment in Revenue. The interview log tags pains per conversation and shows how often each comes up and how many would pay, with a blunt verdict.

## Plan, kill criteria and decisions

- **Rebuild my plan:** the co-founder reads the full dossier and proposes 4–6 new, dated tasks. The founder picks which to commit to. A Growth phase continues past week 4.
- **Kill criteria:** target + metric (paying customers, MRR, revenue, interviews) + deadline, locked until decision day.
- **Decision day:** when the deadline passes, a banner forces a choice (double down / pivot / kill) with a written reason. Decisions feed the co-founder.
- **Accountability partner:** name, email and a pledge. The weekly report is built on the device and sent from the founder's own email app (one tap), because the server can't read the encrypted workspace.

## Accounts, cloud storage and notifications (full app)

1. **Supabase:** create a project, run `supabase/schema.sql`, enable Email auth, and set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Sign-in becomes a magic link, and workspaces sync to the `workspaces` table (row-level security: founders only see their own). Each workspace is end-to-end encrypted on the device first; see **End-to-end encryption** below. Without these keys the app falls back to browser storage.
2. **In-app notifications:** the bell in the header shows today's reminders from `lib/nudges.ts`. Works everywhere, no setup.
3. **Push notifications (free):** standard Web Push, no third-party service. Run `npx web-push generate-vapid-keys` once and set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Founders turn it on in Settings; each device is saved in `push_subscriptions`. Works on Android and desktop browsers, and on iPhone (iOS 16.4+) once STARTIT is added to the home screen (`public/manifest.webmanifest`, `public/sw.js`).
4. **Daily reminder job:** `app/api/cron/nudges` runs daily (`vercel.json`, 04:00 UTC) and sends overdue tasks, tasks due tomorrow, the Sunday check-in, 5+ quiet days and decision day as push notifications (and optional email via `RESEND_API_KEY`). It reads only the content-free `reminders` facts (due dates and counts), so messages say *that* something needs attention, never *what*. Each reminder is sent at most once a day per channel. Protect the job with `CRON_SECRET`.

## Pages and the public demo

- `/` is the landing page (`components/landing/`), rendered on the server so link previews and search engines see it. `/app` is the app itself. Anything aimed at the old address (sign-in links, notifications, payment returns, `/#tab` bookmarks, the store apps) is forwarded to `/app` with its query and hash. In Supabase, add `https://yourdomain.com/app` to the allowed redirect URLs.
- **Demo AI** (`lib/demo.ts`): when the AI isn't configured and the visitor is exploring the ClinicQ sample, the co-founder chat, research analysis (with 8 example posts written for the demo), plan rebuild and investor update return pre-written answers built from the sample's live numbers. Every answer says it's a demo. A founder's own startup never gets these; it gets the "AI isn't switched on" message.

## End-to-end encryption

Code: `lib/vault.ts`, `lib/cloud.ts`, `components/Vault.tsx`.

- **What's encrypted:** the whole workspace (idea, tasks, check-ins, revenue, leads, interviews, research, decisions, chat). It's sealed in the browser with AES-256-GCM before it's saved, with the user's id bound in as authenticated data. The `workspaces.data` column only ever holds ciphertext.
- **The key:** 32 random bytes made on the founder's device, kept in IndexedDB as a non-extractable `CryptoKey`. The same bytes are shown once as a 52-character recovery key. STARTIT never receives it, so neither STARTIT nor anyone with database access can read a workspace, and a lost key can't be recovered.
- **New device or after signing out:** the app asks for the recovery key. "I lost my key" deletes the unreadable workspace and starts fresh.
- **Settings → Get a new recovery key:** re-encrypts with a new key; the old one stops working. The new key is only stored on the device after the server holds the re-encrypted copy.
- **Not encrypted, because the server needs them:** the account email (sign-in), plan and billing ids, daily usage counts, push subscriptions, and the content-free `reminders` facts.
- **AI features:** when the founder uses the co-founder, research analysis, plan rebuilds or investor updates, the relevant part of the workspace is sent over HTTPS to the API route and on to Anthropic to produce that answer. The route doesn't store or log it.
- **Local mode** (no Supabase): the workspace stays in this browser's storage and never leaves the device.

## Plans: Garage, Launch, Scale

Defined once in `lib/plans.ts` (names, prices, limits, feature lists) and enforced on the server.

| | Garage (free) | Launch (₹499 / $9 a month) | Scale (₹1,499 / $29 a month) |
| --- | --- | --- | --- |
| Audit, plan, grading, revenue, customers, launch kit, in-app bell | ✓ | ✓ | ✓ |
| AI co-founder messages / day | 10 | 150 | 400 |
| Live searches / research analyses per day | 5 / 2 | 50 / 20 | 150 / 60 |
| AI plan rebuilds / day | 1 | 8 | 25 |
| Push notifications + email reminders | | ✓ | ✓ |
| Morning brief (today's priorities, every morning) | | | ✓ |
| AI investor update drafts | | | ✓ (10/day) |

**Where each gate is enforced**
- AI and search quotas: `lib/server/guard.ts` → atomic `use_quota` in Postgres. Hitting a limit returns 429 with the tier to upgrade to, and the app opens the plans screen on that tier.
- Push, email reminders, partner emails and the morning brief: the daily job (`app/api/cron/nudges`) only sends to Launch and Scale; the brief only to Scale.
- In the app, locked features show their tier and open the plans screen. In the Claude preview there's no server, so everything is unlocked and AI runs on the viewer's own Claude account.
- `/api/revenue/sync` uses the server's own Stripe/Razorpay keys, so it is **admin-only** (`ADMIN_EMAILS`).

**Billing setup** (India → Razorpay with UPI/cards/netbanking in INR; everyone else → Stripe):
1. **Razorpay:** create two monthly plans → `RAZORPAY_PLAN_LAUNCH`, `RAZORPAY_PLAN_SCALE`. Webhook → `https://<your-domain>/api/billing/webhook/razorpay` with the `subscription.*` events; its secret → `RAZORPAY_WEBHOOK_SECRET`.
2. **Stripe:** create two recurring prices → `STRIPE_PRICE_LAUNCH`, `STRIPE_PRICE_SCALE`. Webhook → `https://<your-domain>/api/billing/webhook/stripe` for `checkout.session.completed` and `customer.subscription.created/updated/deleted` → `STRIPE_WEBHOOK_SECRET`. Enable the customer portal and allow switching between the two prices, so Launch → Scale upgrades prorate.
3. Name the plans **Launch** and **Scale** in both dashboards so receipts match the app.

Only signature-verified webhooks can change a founder's plan. The tier is read from the price/plan id, so changes made in the Stripe portal are picked up. On Razorpay, moving Launch → Scale creates a new subscription and the old one is cancelled as soon as the new one is active. Cancelling keeps the plan until the end of the paid period, then drops to Garage. Test with Razorpay test mode and Stripe test keys before going live.

## Connecting a real backend

The quick audit (`analyzeIdea()` in `lib/engine.ts`) is a deterministic, pattern-based estimate so the app works instantly; real evidence comes from Market Research. Launch copy and code prompts are templates and can be moved to the AI the same way.
