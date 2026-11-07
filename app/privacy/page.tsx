import type { Metadata } from "next";
import { Contact, LEGAL, LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Privacy policy · STARTIT" };

// Matches what the app actually does as of this version. Have it reviewed by a lawyer before launching commercially.
export default function Privacy() {
  return (
    <LegalPage title="Privacy policy">
      <section>
        <p>
          STARTIT is run by {LEGAL.company} (&quot;we&quot;). This policy explains what we collect when you use STARTIT on the web or in our apps, why, who we share it
          with, and the choices you have.
        </p>
      </section>

      <section>
        <h2>The short version</h2>
        <ul>
          <li>Your workspace is <b>end-to-end encrypted</b>. It&apos;s locked on your device with a key only you hold, before it&apos;s saved. We store scrambled data we can&apos;t read.</li>
          <li>We don&apos;t sell your data, show you ads or use your workspace to train AI.</li>
          <li>You can delete your account and everything in it at any time.</li>
        </ul>
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
          <li><b>Reminder facts:</b> the due dates of your open tasks, when you last checked in or used the app, your kill-criteria deadline and the last-update dates of open leads. Dates and counts only, no titles, names or amounts, so we can remind you without reading your workspace.</li>
          <li>
            <b>Sign-in security log:</b> each sign-in attempt (time, step, whether it worked, your email and a scrambled form of your IP address) for 30 days, to stop people guessing
            codes. If you turn on two-step verification, Supabase stores your authenticator secret and we store scrambled backup codes.
          </li>
          <li><b>Your agreement:</b> that you confirmed you&apos;re 18 or older and which version of these terms you accepted, and when.</li>
        </ul>
        <p>You&apos;re responsible for having the right to add other people&apos;s details. Don&apos;t add sensitive information about them that the product doesn&apos;t need.</p>
      </section>

      <section>
        <h2>How your workspace is protected</h2>
        <ul>
          <li>
            Your workspace (your idea, tasks, check-ins, revenue, leads, interviews, research, decisions and chats) is encrypted in your browser with AES-256 before it&apos;s sent to us. Only
            the encrypted version reaches our database. Nobody at STARTIT, and nobody with access to our servers, can read it.
          </li>
          <li>
            The key is created on your device and stays there. You get it once as a <b>recovery key</b> to open your workspace on another device. We never receive it, so we can&apos;t recover it for
            you. If you lose it, the workspace can&apos;t be opened by anyone.
          </li>
          <li>Everything travels over encrypted connections (HTTPS). Your account email, plan and usage counts aren&apos;t end-to-end encrypted, because we need them to sign you in and bill you.</li>
          <li>Without an account (the demo), your workspace is saved only in your own browser and never sent to us.</li>
        </ul>
      </section>

      <section>
        <h2>How we use it</h2>
        <ul>
          <li>To run STARTIT: store your workspace, score your execution, build your plan and send the reminders you&apos;ve turned on.</li>
          <li>
            To answer you with AI: only when you use the co-founder, research analysis, plan rebuilds or investor updates, your browser sends the part of your workspace that answer needs, over
            HTTPS, through our server to our AI provider. We don&apos;t store or log it. The AI provider processes it under its own terms to produce the answer.
          </li>
          <li>To bill you and apply your plan&apos;s limits.</li>
          <li>To keep the service secure and fix problems, including blocking repeated failed sign-ins.</li>
        </ul>
        <p>We don&apos;t sell your data, and we don&apos;t use it for advertising.</p>
      </section>

      <section>
        <h2>Who we share it with</h2>
        <p>Only service providers that run parts of STARTIT for us, and only what each needs:</p>
        <ul>
          <li><b>Supabase:</b> hosts your account and your encrypted workspace.</li>
          <li><b>Cloudflare:</b> shows a human check (Turnstile) after repeated failed sign-ins, and receives your IP address for it.</li>
          <li><b>Vercel:</b> hosts the app.</li>
          <li><b>Anthropic:</b> generates AI answers from the data you send through AI features.</li>
          <li><b>Razorpay</b> (India) and <b>Stripe</b> (elsewhere): process payments.</li>
          <li><b>Resend:</b> sends reminder emails, which only say that something needs your attention, not what.</li>
          <li><b>Browser and phone push services</b> (Apple, Google, Mozilla): deliver push notifications.</li>
          <li>
            <b>Search sources</b> (Hacker News, the App Store, Stack Exchange, Bluesky): receive the search words you type in Market Research, not your account details.
          </li>
          <li><b>Your accountability partner:</b> only if you send them your weekly report yourself, from your own email app.</li>
        </ul>
        <p>We may also share information when the law requires it.</p>
        <p>Some of these providers process data outside your country, including in the United States, under their own security and data-protection commitments.</p>
      </section>

      <section>
        <h2>How long we keep it</h2>
        <p>
          We keep your data while your account is open. When you delete your account, your encrypted workspace and account data are deleted from our database straight away. Payment
          providers keep their own billing records as the law requires. If there&apos;s ever a security breach that affects your data, we&apos;ll tell you and the authorities as the law requires.
        </p>
      </section>

      <section>
        <h2>Your choices and rights</h2>
        <ul>
          <li><b>See and correct</b> your data: everything you&apos;ve entered is visible and editable in the app.</li>
          <li><b>Take it with you:</b> Settings → Download my data saves your whole workspace as a file.</li>
          <li><b>Delete your account:</b> Settings → Delete account, in the app or at {LEGAL.site}. This cancels any paid plan immediately.</li>
          <li><b>Turn off</b> push and email reminders in Settings at any time.</li>
          <li><b>Ask us</b> anything about your data at <Contact />.</li>
        </ul>
        <p>
          If you&apos;re in India, you can raise a complaint with our Grievance Officer, {LEGAL.grievanceOfficer}, at <Contact />. You may also have rights under the laws of your own country,
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
