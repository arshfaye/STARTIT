/**
 * Links built from data (research posts, saved workspaces) are only ever http(s).
 * React doesn't block `javascript:` URLs, so every data-driven href goes through this.
 */
export function safeUrl(u: string | null | undefined): string | undefined {
  if (!u) return undefined;
  try {
    const p = new URL(u);
    return p.protocol === "https:" || p.protocol === "http:" ? p.href : undefined;
  } catch {
    return undefined;
  }
}
