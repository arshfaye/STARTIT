/**
 * POST /api/research  { sources: SignalSource[], query: string, country?: "IN" | "US" | … }
 * Returns { signals: Signal[], errors: { [source]: message } }.
 *
 * Free sources:
 *   hn             Hacker News via Algolia. No key.
 *   appstore       Reviews of the top matching iOS apps (your competitors) from Apple's public
 *                  review feed, in the founder's country store. No key.
 *   stackexchange  Questions on Stack Exchange sites (Software Recommendations is the best one for
 *                  "what tool does X?" demand). Works without a key (small daily quota);
 *                  STACKEXCHANGE_KEY (free, stackapps.com) raises it. STACKEXCHANGE_SITES optional.
 *   bluesky        Post search needs a logged-in account: BLUESKY_HANDLE + BLUESKY_APP_PASSWORD
 *                  (free; create an app password in Bluesky settings).
 *   reddit         REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USER_AGENT. Free for low volume;
 *                  Reddit requires a contract for commercial use and permission for ML use.
 */
import { guard } from "@/lib/server/guard";
import type { Signal, SignalSource } from "@/lib/types";

export const runtime = "nodejs";

const day = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 10);
const strip = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

/* ------------------------------------------------------------ Hacker News -- */
async function hn(q: string): Promise<Signal[]> {
  const r = await fetch(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=(story,comment)&hitsPerPage=50`);
  if (!r.ok) throw new Error(`Hacker News search failed (${r.status})`);
  const j = (await r.json()) as { hits: { objectID: string; title?: string; story_title?: string; comment_text?: string; story_text?: string; author: string; points?: number; num_comments?: number; created_at_i: number }[] };
  return j.hits
    .map((h) => {
      const text = strip(h.comment_text || h.story_text || h.title || "");
      return {
        id: `hn-${h.objectID}`,
        source: "hn" as const,
        title: h.title || h.story_title || text.slice(0, 90),
        text: text.slice(0, 2000),
        url: `https://news.ycombinator.com/item?id=${h.objectID}`,
        author: h.author,
        community: "Hacker News",
        score: h.points ?? undefined,
        comments: h.num_comments ?? undefined,
        date: day(h.created_at_i),
      };
    })
    .filter((s) => s.text.length > 20);
}

/* ------------------------------------------------------ App Store reviews -- */
async function appstore(q: string, country: string): Promise<Signal[]> {
  const cc = (country || "us").toLowerCase();
  const search = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=software&country=${cc}&limit=3`);
  if (!search.ok) throw new Error(`App Store search failed (${search.status})`);
  const apps = ((await search.json()) as { results: { trackId: number; trackName: string }[] }).results;
  if (!apps.length) return [];
  const perApp = await Promise.all(
    apps.map(async (app) => {
      const r = await fetch(`https://itunes.apple.com/${cc}/rss/customerreviews/page=1/id=${app.trackId}/sortby=mostrecent/json`);
      if (!r.ok) return [] as Signal[];
      const j = (await r.json()) as {
        feed?: { entry?: { id: { label: string }; title: { label: string }; content: { label: string }; author: { name: { label: string } }; "im:rating": { label: string }; updated: { label: string } }[] };
      };
      const entries = Array.isArray(j.feed?.entry) ? j.feed!.entry! : [];
      return entries.map((e) => ({
        id: `as-${e.id.label}`,
        source: "appstore" as const,
        title: `${app.trackName}: ${e.title.label}`,
        text: e.content.label.slice(0, 2000),
        url: `https://apps.apple.com/${cc}/app/id${app.trackId}?see-all=reviews`,
        author: e.author.name.label,
        community: app.trackName,
        rating: Number(e["im:rating"].label) || undefined,
        date: e.updated.label.slice(0, 10),
      }));
    }),
  );
  // Complaints are the point: lowest ratings first, capped so one app can't drown the rest.
  return perApp.flatMap((list) => list.sort((a, b) => (a.rating ?? 5) - (b.rating ?? 5)).slice(0, 25));
}

/* --------------------------------------------------------- Stack Exchange -- */
async function stackexchange(q: string): Promise<Signal[]> {
  const sites = (process.env.STACKEXCHANGE_SITES || "softwarerecs,webapps,stackoverflow").split(",").map((s) => s.trim()).filter(Boolean);
  const key = process.env.STACKEXCHANGE_KEY ? `&key=${process.env.STACKEXCHANGE_KEY}` : "";
  const results = await Promise.all(
    sites.map(async (site) => {
      const r = await fetch(`https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(q)}&site=${site}&pagesize=20&filter=withbody${key}`);
      if (!r.ok) throw new Error(`Stack Exchange (${site}) failed (${r.status})`);
      const j = (await r.json()) as { items: { question_id: number; title: string; body: string; link: string; score: number; answer_count: number; creation_date: number; owner?: { display_name?: string } }[] };
      return j.items.map((it) => ({
        id: `se-${site}-${it.question_id}`,
        source: "stackexchange" as const,
        title: strip(it.title),
        text: strip(it.body).slice(0, 2000),
        url: it.link,
        author: it.owner?.display_name,
        community: site === "softwarerecs" ? "Software Recommendations" : site,
        score: it.score,
        comments: it.answer_count,
        date: day(it.creation_date),
      }));
    }),
  );
  return results.flat();
}

/* ---------------------------------------------------------------- Bluesky -- */
let bskyToken: { jwt: string; expires: number } | null = null;
async function bluesky(q: string): Promise<Signal[]> {
  const handle = process.env.BLUESKY_HANDLE;
  const pass = process.env.BLUESKY_APP_PASSWORD;
  if (!handle || !pass) throw new Error("Add BLUESKY_HANDLE and BLUESKY_APP_PASSWORD (free account) to search Bluesky.");
  if (!bskyToken || bskyToken.expires < Date.now()) {
    const r = await fetch("https://bsky.social/xrpc/com.atproto.server.createSession", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: handle, password: pass }),
    });
    if (!r.ok) throw new Error(`Bluesky login failed (${r.status})`);
    bskyToken = { jwt: ((await r.json()) as { accessJwt: string }).accessJwt, expires: Date.now() + 60 * 60 * 1000 };
  }
  const r = await fetch(`https://bsky.social/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(q)}&limit=50&sort=top`, { headers: { Authorization: `Bearer ${bskyToken.jwt}` } });
  if (!r.ok) throw new Error(`Bluesky search failed (${r.status})`);
  const j = (await r.json()) as { posts: { uri: string; author: { handle: string }; record: { text?: string; createdAt?: string }; likeCount?: number; replyCount?: number }[] };
  return j.posts
    .filter((p) => (p.record.text ?? "").length > 20)
    .map((p) => ({
      id: `bs-${p.uri.split("/").pop()}`,
      source: "bluesky" as const,
      title: (p.record.text ?? "").slice(0, 90),
      text: (p.record.text ?? "").slice(0, 2000),
      url: `https://bsky.app/profile/${p.author.handle}/post/${p.uri.split("/").pop()}`,
      author: p.author.handle,
      community: "Bluesky",
      score: p.likeCount,
      comments: p.replyCount,
      date: p.record.createdAt?.slice(0, 10),
    }));
}

/* ----------------------------------------------------------------- Reddit -- */
let redditToken: { value: string; expires: number } | null = null;
async function reddit(q: string): Promise<Signal[]> {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  const ua = process.env.REDDIT_USER_AGENT || "web:startit:1.0";
  if (!id || !secret) throw new Error("Add REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET to search Reddit.");
  if (!redditToken || redditToken.expires < Date.now()) {
    const r = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded", "User-Agent": ua },
      body: "grant_type=client_credentials",
    });
    if (!r.ok) throw new Error(`Reddit auth failed (${r.status})`);
    const j = (await r.json()) as { access_token: string; expires_in: number };
    redditToken = { value: j.access_token, expires: Date.now() + (j.expires_in - 60) * 1000 };
  }
  const r = await fetch(`https://oauth.reddit.com/search?q=${encodeURIComponent(q)}&sort=relevance&t=year&limit=50&type=link&raw_json=1`, {
    headers: { Authorization: `Bearer ${redditToken.value}`, "User-Agent": ua },
  });
  if (!r.ok) throw new Error(`Reddit search failed (${r.status})`);
  const j = (await r.json()) as { data: { children: { data: { id: string; title: string; selftext: string; permalink: string; author: string; subreddit_name_prefixed: string; score: number; num_comments: number; created_utc: number; over_18: boolean } }[] } };
  return j.data.children
    .map((c) => c.data)
    .filter((d) => !d.over_18)
    .map((d) => ({
      id: `rd-${d.id}`,
      source: "reddit" as const,
      title: d.title,
      text: (d.selftext || d.title).slice(0, 2000),
      url: `https://www.reddit.com${d.permalink}`,
      author: d.author,
      community: d.subreddit_name_prefixed,
      score: d.score,
      comments: d.num_comments,
      date: day(d.created_utc),
    }));
}

type Live = Exclude<SignalSource, "pasted">;
const RUN: Record<Live, (q: string, country: string) => Promise<Signal[]>> = { hn, appstore, stackexchange, bluesky, reddit };

/** Probe: lets the app check that live search exists here and which sources have their keys. */
export async function GET() {
  return Response.json({
    ok: true,
    sources: { hn: true, appstore: true, stackexchange: true, bluesky: !!(process.env.BLUESKY_HANDLE && process.env.BLUESKY_APP_PASSWORD), reddit: !!(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET) },
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { sources?: string[]; query?: string; country?: string };
  const query = (body.query ?? "").trim().slice(0, 200);
  const country = /^[A-Za-z]{2}$/.test(body.country ?? "") ? body.country! : "US";
  const sources = (body.sources ?? []).filter((s): s is Live => s in RUN);
  if (!query) return Response.json({ error: "Enter something to search for." }, { status: 400 });
  if (!sources.length) return Response.json({ error: "Pick at least one source." }, { status: 400 });

  const caller = await guard(req, "search");
  if (caller instanceof Response) return caller;

  const errors: Record<string, string> = {};
  const results = await Promise.all(
    sources.map((s) =>
      RUN[s](query, country).catch((e: Error) => {
        errors[s] = e.message;
        return [] as Signal[];
      }),
    ),
  );
  return Response.json({ signals: results.flat(), errors });
}
