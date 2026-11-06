import type { ReactNode } from "react";

/**
 * Shared layout for /privacy and /terms.
 * Fill in everything in LEGAL below before launch, and have a lawyer review both pages.
 */
export const LEGAL = {
  company: "[Your company's legal name]",
  address: "[Registered address]",
  email: "[support@yourdomain.com]",
  grievanceOfficer: "[Name of your Grievance Officer]",
  effective: "[Date you publish this]",
  site: "[yourdomain.com]",
};

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <a href="/" className="text-sm text-muted hover:text-ink">
        ← Back to STARTIT
      </a>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted">Effective {LEGAL.effective}</p>
      <div className="mt-8 space-y-8 text-[15px] leading-relaxed [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p+p]:mt-3 [&_ul]:mt-2 [&_ul]:space-y-1">
        {children}
      </div>
    </main>
  );
}
