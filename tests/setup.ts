/**
 * Test setup (preloaded by bunfig.toml): an in-memory stand-in for Next.js's cookie store,
 * so server code that reads and writes session cookies can run under `bun test`.
 */
import { mock } from "bun:test";

export type CookieOpts = { httpOnly?: boolean; secure?: boolean; sameSite?: string; path?: string; maxAge?: number };
export const jar = new Map<string, { value: string; opts: CookieOpts }>();

mock.module("next/headers", () => ({
  cookies: () => ({
    get: (name: string) => (jar.has(name) && jar.get(name)!.value ? { name, value: jar.get(name)!.value } : undefined),
    set: (name: string, value: string, opts: CookieOpts) => {
      if (opts?.maxAge === 0) jar.delete(name);
      else jar.set(name, { value, opts });
    },
  }),
}));
