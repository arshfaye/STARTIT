import type { ReactNode } from "react";

/**
 * Shared layout for /privacy and /terms.
 * Before launching commercially: replace the contact with a support email, add a business address,
 * and have a lawyer review both pages.
 */
export const LEGAL = {
  company: "Arsh Faye",
  contact: "github.com/arshfaye/STARTIT",
  contactUrl: "https://github.com/arshfaye/STARTIT/issues",
  grievanceOfficer: "Arsh Faye",
  effective: "6 November 2026",
  site: "this website",
};

/** True when this deployment has no accounts database: everything stays in the visitor's browser. */
export const isDemo = () => !process.env.NEXT_PUBLIC_SUPABASE_URL;

export function Contact() {
  return (
    <a href={LEGAL.contactUrl} className="underline underline-offset-2">
      {LEGAL.contact}
    </a>
  );
}

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <a href="/" className="text-sm text-muted hover:text-ink">
        ← Back to STARTIT
      </a>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted">Effective {LEGAL.effective}</p>
      {isDemo() && (
        <p className="mt-6 rounded-lg border border-line bg-abyss p-4 text-sm leading-relaxed">
          <b>This site is a demo.</b> Your account and everything you enter stay in your own browser and are never sent to our servers. AI features are switched off and no payments are
          taken. The policy below describes the full version of STARTIT.
        </p>
      )}
      <div className="mt-8 space-y-8 text-[15px] leading-relaxed [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p+p]:mt-3 [&_ul]:mt-2 [&_ul]:space-y-1">
        {children}
      </div>
    </main>
  );
}
