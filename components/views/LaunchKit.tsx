"use client";

import { ExternalLink, Hash, MessagesSquare, Megaphone, RefreshCw, Users } from "lucide-react";
import { safeUrl } from "@/lib/safeUrl";
import { useState } from "react";
import { communitiesFor, launchCopy, type CopyChannel } from "@/lib/engine";
import { useStore } from "@/lib/store";
import { Badge, Card, CardHeader, CopyButton, cx } from "../ui";

const CHANNELS: { id: CopyChannel; label: string; hint: string }[] = [
  { id: "reddit", label: "Reddit feedback post", hint: "Ask for criticism, never for upvotes. Links go in comments, if at all." },
  { id: "x", label: "X / Twitter thread", hint: "Lead with the surprising insight, not the product." },
  { id: "hn", label: "Show HN", hint: "Must be usable without signup. Post 8–10am US Eastern, reply to every comment." },
];

const PLATFORM_TONE = { Reddit: "flame", Discord: "cyber", Forum: "amber", Slack: "cyber", Facebook: "cyber", X: "slate" } as const;

export function LaunchKit() {
  const { state } = useStore();
  const [channel, setChannel] = useState<CopyChannel>("reddit");
  const [variant, setVariant] = useState(0);
  const communities = communitiesFor(state.analysis?.category ?? "general");
  const copy = launchCopy(channel, state.idea, state.analysis, variant);
  const fullText = copy.title ? `${copy.title}\n\n${copy.body}` : copy.body;
  const ch = CHANNELS.find((c) => c.id === channel)!;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <Card>
        <CardHeader
          eyebrow="Community locator"
          title={`Where your first 100 users hang out`}
          icon={<Users className="h-4 w-4" />}
          action={<Badge tone="cyber">{communities.length} found</Badge>}
        />
        <ul className="space-y-2.5">
          {communities.map((c) => (
            <li key={c.name}>
              <a
                href={safeUrl(c.url)}
                target="_blank"
                rel="noreferrer"
                className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-xl border border-line bg-surface p-3.5 transition hover:bg-abyss"
              >
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-abyss text-muted group-hover:text-ink">
                  {c.platform === "Reddit" ? <Hash className="h-4 w-4" /> : <MessagesSquare className="h-4 w-4" />}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{c.name}</p>
                    <Badge tone={PLATFORM_TONE[c.platform]} className="px-2 py-0.5 text-[10px]">{c.platform}</Badge>
                    {c.fit === "Core" && <Badge tone="emerald" className="px-2 py-0.5 text-[10px]">Core fit</Badge>}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{c.angle}</p>
                </div>
                <div className="text-right">
                  <p className="tnum text-xs text-ink">{c.members}</p>
                  <ExternalLink className="ml-auto mt-1.5 h-3.5 w-3.5 text-muted group-hover:text-ink" />
                </div>
              </a>
            </li>
          ))}
        </ul>
      </Card>

      <Card strong className="min-w-0">
        <CardHeader
          eyebrow="Launch copy generator"
          title={`Day-1 posts for ${state.idea.name}`}
          icon={<Megaphone className="h-4 w-4" />}
        />
        <div role="tablist" aria-label="Launch channel" className="mb-4 grid grid-cols-3 gap-1 rounded-xl border border-line bg-abyss p-1">
          {CHANNELS.map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={channel === c.id}
              onClick={() => {
                setChannel(c.id);
                setVariant(0);
              }}
              className={cx(
                "rounded-lg px-2 py-2 text-xs font-medium transition sm:text-sm",
                channel === c.id ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
              )}
            >
              {c.id === "reddit" ? "Reddit" : c.id === "x" ? "X thread" : "Show HN"}
            </button>
          ))}
        </div>
        <p className="mb-3 text-xs text-muted">{ch.hint}</p>
        <div className="rounded-lg border border-line bg-abyss p-4">
          {copy.title && (
            <>
              <p className="eyebrow mb-1">Title</p>
              <p className="mb-4 font-medium leading-snug text-ink">{copy.title}</p>
              <p className="eyebrow mb-1">Body</p>
            </>
          )}
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/90">{copy.body}</p>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <span className="tnum text-[11px] text-muted">
            {fullText.length} chars · variant {(variant % 2) + 1}/2
          </span>
          <div className="flex gap-2">
            <button className="btn-ghost px-3 py-2 text-xs" onClick={() => setVariant((v) => v + 1)}>
              <RefreshCw className="h-3.5 w-3.5" /> Regenerate
            </button>
            <CopyButton text={fullText} />
          </div>
        </div>
      </Card>
    </div>
  );
}
