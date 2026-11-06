import type { Metadata } from "next";
import { LEGAL, LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Privacy policy · STARTIT" };

// DRAFT. Matches what the app actually does as of this version. Replace the bracketed values in
// components/legal/LegalPage.tsx and have it reviewed by a lawyer before launch.
export default function Privacy() {
  return (
    <LegalPage title="Privacy policy">
      <section>
        <p>
          STARTIT is run by {LEGAL.company}, {LEGAL.address} (&quot;we&quot;). This policy explains what we collect when you use STARTIT on the web or in our apps, why, who we share it
          with, and the choices you have.
        </p>
      </section>

      <section>
        <h2>What we collect</h2>
        <ul>
          <li><b>Account:</b> your name and email address.</li>
          <li><b>Location settings:</b> the country and currency you choose. We suggest a country from your device&apos;s time zone; we don&apos;t collect GPS location.</li>
          <li>
            <b>What you put into your workspace:</b> your startup idea, tasks, weekly check-ins, revenue you log or import, sales leads, customer interview notes, market research posts you
            collect, decisions, and your chats with the AI co-founder.
          </li>
          <li><b>Other people&apos;s details you add:</b> names, companies and notes about your leads, interviewees and accountability partner (including the partner&apos;s email).</li>
          <li><b>Billing status:</b> your plan, its renewal date and the payment provider&apos;s customer and subscription IDs. We never see or store your card, UPI or bank details.</li>
          <li><b>Usage counts:</b> how many AI messages, searches and similar actions you used each day, to apply plan limits.</li>
          <li><b>Notifications:</b> if you turn on push notifications, a device token that lets us send them.</li>
        </ul>
        <p>You&apos;re responsible for having the right to add other people&apos;s details. Don&apos;t add sensitive information about them that the product doesn&apos;t need.</p>
      </section>

      <section>
        <h2>How we use it</h2>
        <ul>
          <li>To run STARTIT: store your workspace, score your execution, build your plan and send the reminders you&apos;ve turned on.</li>
          <li>To answer you with AI: when you use the co-founder, research analysis, plan rebuilds or investor updates, the relevant workspace data is sent to our AI provider to generate the answer.</li>
          <li>To bill you and apply your plan&apos;s limits.</li>
          <li>To keep the service secure and fix problems.</li>
        </ul>
        <p>We don&apos;t sell your data, and we don&apos;t use it for advertising.</p>
      </section>

      <section>
        <h2>Who we share it with</h2>
        <p>Only service providers that run parts of STARTIT for us, and only what each needs:</p>
        <ul>
          <li><b>Supabase:</b> hosts your account and workspace.</li>
          <li><b>Vercel:</b> hosts the app.</li>
          <li><b>Anthropic:</b> generates AI answers from the data you send through AI features.</li>
          <li><b>Razorpay</b> (India) and <b>Stripe</b> (elsewhere): process payments.</li>
          <li><b>Resend:</b> sends reminder and partner emails.</li>
          <li><b>Browser and phone push services</b> (Apple, Google, Mozilla): deliver push notifications.</li>
          <li>
            <b>Search sources</b> (Hacker News, the App Store, Stack Exchange, Bluesky, Reddit): receive the search words you type in Market Research, not your account details.
          </li>
          <li><b>Your accountability partner:</b> receives your weekly report by email, only if you add one.</li>
        </ul>
        <p>We may also share information when the law requires it.</p>
        <p>Some of these providers process data outside your country, including in the United States, under their own security and data-protection commitments.</p>
      </section>

      <section>
        <h2>How long we keep it</h2>
        <p>
          We keep your data while your account is open. When you delete your account, your workspace and account data are deleted from our database straight away. Payment providers keep
          their own billing records as the law requires.
        </p>
      </section>

      <section>
        <h2>Your choices and rights</h2>
        <ul>
          <li><b>See and correct</b> your data: everything you&apos;ve entered is visible and editable in the app.</li>
          <li><b>Delete your account:</b> Settings → Delete account, in the app or at {LEGAL.site}. This cancels any paid plan immediately.</li>
          <li><b>Turn off</b> push and email reminders in Settings at any time.</li>
          <li><b>Ask us</b> anything about your data at {LEGAL.email}.</li>
        </ul>
        <p>
          If you&apos;re in India, you can raise a complaint with our Grievance Officer, {LEGAL.grievanceOfficer}, at {LEGAL.email}. You may also have rights under the laws of your own country,
          such as the GDPR in Europe.
        </p>
      </section>

      <section>
        <h2>Children</h2>
        <p>STARTIT is for people aged 18 and over. We don&apos;t knowingly collect data from children.</p>
      </section>

      <section>
        <h2>Changes</h2>
        <p>If we change this policy in a way that matters, we&apos;ll tell you in the app or by email before it takes effect.</p>
      </section>
    </LegalPage>
  );
}
