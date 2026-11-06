import type { Metadata } from "next";
import { Contact, LEGAL, LegalPage } from "@/components/legal/LegalPage";
import { TIERS } from "@/lib/plans";

export const metadata: Metadata = { title: "Terms of service · STARTIT" };

// Have a lawyer review before launching commercially, especially the liability and governing-law sections.
export default function Terms() {
  const paid = TIERS.filter((t) => t.price.INR > 0);
  return (
    <LegalPage title="Terms of service">
      <section>
        <p>
          These terms are an agreement between you and {LEGAL.company} for your use of STARTIT on the web and in our apps. By creating an account you agree to them. You must be 18 or older.
        </p>
      </section>

      <section>
        <h2>What STARTIT is, and isn&apos;t</h2>
        <p>
          STARTIT helps you test an idea, plan the work and hold yourself accountable. Its scores, research summaries and AI answers are opinions generated from the data you give it and from
          public posts. They can be wrong. They are not legal, financial, tax or investment advice, and you make your own decisions.
        </p>
      </section>

      <section>
        <h2>Your account and your content</h2>
        <ul>
          <li>Keep your sign-in email secure. You&apos;re responsible for activity on your account.</li>
          <li>You own what you put into STARTIT. You give us permission to store and process it only to run the service for you.</li>
          <li>Only add other people&apos;s details (leads, interviewees, your partner) when you have the right to.</li>
          <li>You can delete your account at any time in Settings.</li>
        </ul>
      </section>

      <section>
        <h2>Acceptable use</h2>
        <p>
          Don&apos;t use STARTIT to break the law, harass anyone, send spam, try to get around plan limits or security, scrape or overload the service, or resell it. We may suspend accounts that do.
        </p>
      </section>

      <section>
        <h2>Plans and payment</h2>
        <ul>
          <li>Garage is free. {paid.map((t) => `${t.name} (₹${t.price.INR.toLocaleString("en-IN")} or $${t.price.USD} a month)`).join(" and ")} are monthly subscriptions, billed in advance and renewing automatically until you cancel.</li>
          <li>Payments are processed by Razorpay in India and Stripe elsewhere. Taxes may be added where required.</li>
          <li>Cancel any time in Settings. You keep your plan until the end of the period you&apos;ve paid for, then move to Garage. Except where the law requires otherwise, payments aren&apos;t refunded for partial months.</li>
          <li>We may change prices or plan limits. We&apos;ll give you at least 30 days&apos; notice before a price change affects you.</li>
        </ul>
      </section>

      <section>
        <h2>Availability and changes</h2>
        <p>We work to keep STARTIT running but can&apos;t promise it will always be available or error-free. We may change or remove features, and will tell you before removing anything you pay for.</p>
      </section>

      <section>
        <h2>Liability</h2>
        <p>
          To the extent the law allows, STARTIT is provided &quot;as is&quot;, and we aren&apos;t liable for indirect losses or for decisions you make based on it. Our total liability to you is limited to
          what you paid us in the 12 months before the claim.
        </p>
      </section>

      <section>
        <h2>Ending this agreement</h2>
        <p>You can stop using STARTIT and delete your account at any time. We may end or suspend your account if you seriously break these terms, and will tell you why where we can.</p>
      </section>

      <section>
        <h2>Law and contact</h2>
        <p>
          These terms are governed by the laws of India, and disputes go to the courts of India, unless the law where you live gives you other rights. Questions: <Contact />.
        </p>
      </section>
    </LegalPage>
  );
}
