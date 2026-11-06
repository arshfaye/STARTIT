# Launching STARTIT as an app

STARTIT ships in three stages. Each one works on its own, so you can stop after any of them.

| Stage | What users get | Cost to you | Time |
| --- | --- | --- | --- |
| 1. Web app | startit on your domain, installable from the browser (home-screen icon, full screen, push notifications) | Domain + hosting | A day |
| 2. Android app | STARTIT on Google Play | US$25 once | 1–3 weeks (includes Google's testing period) |
| 3. iPhone app | STARTIT on the App Store | US$99 a year + a Mac | 1–2 weeks |

The store apps are the same web app inside a native shell (Capacitor). Every deploy to the website updates the apps too; you only resubmit to the stores when the shell itself changes.

---

## What you need

**Accounts**
- A domain name, e.g. from Namecheap, GoDaddy or Cloudflare.
- **Vercel** for hosting. Use the Pro plan once you charge money: the free Hobby plan is for non-commercial use.
- **Supabase** for accounts and data (the free tier is enough to start).
- **Anthropic** API key for the AI co-founder (pay per use).
- **Razorpay** (India) and/or **Stripe** (everyone else) for payments.
- **Resend** for email (free tier) — optional.
- **Google Play Console** (US$25 once) for Android.
- **Apple Developer Program** (US$99/year) for iPhone.

**Tools on your computer**
- Node.js 20+.
- **Android Studio** for the Android app (Windows, Mac or Linux).
- **A Mac with Xcode** for the iPhone app. No Mac? Cloud build services such as Codemagic can build and upload it for you.

---

## Stage 1 — the web app

1. `npm install`, then `npm run dev` and click through everything locally.
2. Supabase: create a project, run `supabase/schema.sql` in the SQL editor, turn on Email sign-in.
   - In **Authentication → Email Templates → Magic Link**, make sure the email includes the code: add `Your code: {{ .Token }}`. Phone-app users sign in with this code, because a link would open the browser instead of the app.
3. Fill in `components/legal/LegalPage.tsx` (company name, address, contact email, Grievance Officer) and **have a lawyer review** `/privacy` and `/terms`. Both stores require a privacy policy URL.
4. Push the code to GitHub, import it in Vercel, add every value from `.env.example` in Vercel → Settings → Environment Variables, and connect your domain.
5. Payments: create the Launch and Scale plans and the webhooks ([GUIDE.md → Plans](GUIDE.md#plans-garage-launch-scale)). Test a full purchase in test mode.
6. Generate push keys (`npx web-push generate-vapid-keys`) and add them.

Users can now install STARTIT: on Android Chrome, "Install app"; on iPhone Safari, Share → Add to Home Screen.

## Stage 2 — Android (Google Play)

```bash
npm run app:icons                                   # all icon and splash sizes from resources/
npx cap add android                                 # first time only
CAP_SERVER_URL=https://yourdomain.com npm run app:sync
npm run app:android                                 # opens Android Studio
```

1. In `capacitor.config.ts`, set `appId` to a reverse domain you own (e.g. `com.yourcompany.startit`). **It can't change after release.**
2. In Android Studio: Build → Generate Signed App Bundle. Keep the signing key safe; you need it for every update.
3. In Play Console, create the app and complete:
   - Store listing: name, short and full description, screenshots, icon, feature graphic.
   - Privacy policy URL: `https://yourdomain.com/privacy`.
   - **Data safety form**: declare name, email, user content, payment status, and that data is sent to your service providers (see the privacy policy).
   - **Account deletion URL**: `https://yourdomain.com` (Settings → Delete account works on the web too).
   - Content rating questionnaire, target audience 18+.
4. New personal developer accounts must run a **closed test** with a minimum number of testers for 14 days before going public (check Play Console for the current number). Invite founder friends.
5. Promote to production.

## Stage 3 — iPhone (App Store)

```bash
npx cap add ios                                     # first time only, on a Mac
CAP_SERVER_URL=https://yourdomain.com npm run app:sync
npm run app:ios                                     # opens Xcode
```

1. In Xcode, set your team, bundle ID (same as `appId`) and version. Product → Archive → upload to App Store Connect.
2. In App Store Connect, complete:
   - Description, keywords, screenshots (6.7" and 6.5" iPhone at minimum), support URL, privacy policy URL.
   - **App Privacy labels**: same data as Google's Data safety form.
   - **Review notes + a demo account**: give Apple a test email and explain how to get the code (use an inbox you can read during review), plus a short tour of the main features.
3. Submit for review.

**Apple rejects apps that are "just a website"** (guideline 4.2). STARTIT has a native-style tab bar, its own sign-in and offline screen, and real tools, which helps, but it's still the most likely reason for a first rejection. If it happens, the fix is adding native features such as native push notifications or Face ID sign-in, which I can build.

---

## Payments inside the store apps

Apple and Google both require their own billing for subscriptions sold inside their apps (rules for linking to your website differ by country and keep changing). So the store apps **show no prices or checkout**: Garage works fully, limits still apply, and the plan someone bought on the website is honoured.

Before you charge iPhone users inside the app, add Apple in-app purchase (RevenueCat makes this manageable). Check Apple's and Google's current rules for your countries before you do, as they've changed often since 2025.

## Already built for the stores

- Account deletion in Settings: cancels any paid plan immediately, then deletes everything (both stores require it).
- Privacy policy and terms pages (drafts, need your details and a legal review).
- Sign-in with a 6-digit email code, which works inside an app.
- No web checkout inside the store apps; the server refuses it too.
- Safe areas for the notch and status bar, an offline screen, and app icon and splash sources.

## Not built yet

- **Native push** in the store apps (web push doesn't work inside them; the in-app bell does).
- **Apple / Google in-app purchase.**
- Face ID sign-in and the native share sheet (optional, help with Apple review).
