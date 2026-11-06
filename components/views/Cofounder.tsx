"use client";

import { ArrowUp, Bot, Square, Trash2 } from "lucide-react";
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { today } from "@/lib/engine";
import { askCofounder, buildTurns, CofounderError, errorCopy, STARTERS, type ChatMessage } from "@/lib/cofounder";
import { demoReply, isDemoWorkspace, streamDemo } from "@/lib/demo";
import { useStore } from "@/lib/store";
import { cx } from "../ui";

export function Cofounder() {
  const { state, dispatch, exec } = useStore();
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null); // live assistant text; "" = thinking
  const [error, setError] = useState<string | null>(null);
  const ctl = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const busy = streaming !== null;

  const now = today();
  const overdue = state.tasks.filter((t) => !t.done && t.due < now).length;
  const lastCheck = state.checkIns[state.checkIns.length - 1];

  const send = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || busy) return;
      setError(null);
      setInput("");
      const history: ChatMessage[] = [...state.chat, { role: "user", content: q }];
      dispatch({ type: "CHAT_SET", chat: history });
      setStreaming("");
      const c = new AbortController();
      ctl.current = c;
      try {
        const answer = await askCofounder(buildTurns(state, history), { signal: c.signal, onText: (t) => setStreaming(t) });
        dispatch({ type: "CHAT_SET", chat: [...history, { role: "assistant", content: answer }] });
      } catch (e) {
        const err = e instanceof CofounderError ? e : new CofounderError("upstream_error", String(e));
        // Public demo: no AI here, so the ClinicQ sample gets a pre-written answer built from its live numbers.
        if (err.code === "not_configured" && isDemoWorkspace(state)) {
          const answer = await streamDemo(demoReply(state, q), (t) => setStreaming(t), c.signal);
          dispatch({ type: "CHAT_SET", chat: [...history, { role: "assistant", content: answer }] });
          return;
        }
        if (err.partial?.trim()) dispatch({ type: "CHAT_SET", chat: [...history, { role: "assistant", content: err.partial + (err.code === "cancelled" ? "\n\n_(stopped)_" : "") }] });
        if (err.code !== "cancelled") setError(errorCopy(err.code));
      } finally {
        setStreaming(null);
        ctl.current = null;
      }
    },
    [busy, state, dispatch],
  );

  // A question handed over from another screen ("Get my orders", "Should I pivot?")
  useEffect(() => {
    if (state.pendingPrompt && !busy) {
      const p = state.pendingPrompt;
      dispatch({ type: "CONSUME_PROMPT" });
      void send(p);
    }
  }, [state.pendingPrompt, busy, dispatch, send]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [state.chat.length, streaming]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [input]);

  const empty = state.chat.length === 0 && !busy;

  return (
    <div className="mx-auto flex max-w-3xl flex-col">
      {/* What the co-founder is looking at */}
      <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-line px-4 py-3 text-xs text-muted">
        <span className="font-medium text-ink">Reading your live data</span>
        <span>
          Kill score <b className="tnum font-medium text-ink">{state.analysis?.killScore ?? "—"}%</b>
        </span>
        <span>
          Grade <b className="font-medium text-ink">{exec.grade}</b> · <span className="tnum">{exec.score}</span>
        </span>
        <span className={overdue ? "text-flame" : ""}>
          <b className="tnum font-medium">{overdue}</b> overdue
        </span>
        <span>
          Last check-in <b className="font-medium text-ink">{lastCheck ? `W${lastCheck.week} ${lastCheck.grade}` : "none"}</b>
        </span>
        {state.chat.length > 0 && (
          <button
            onClick={() => {
              ctl.current?.abort();
              dispatch({ type: "CHAT_SET", chat: [] });
              setError(null);
            }}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-abyss hover:text-ink"
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear chat
          </button>
        )}
      </div>

      {empty ? (
        <div className="py-10 text-center sm:py-16">
          <div className="mx-auto mb-4 grid h-10 w-10 place-items-center rounded-full border border-line">
            <Bot className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <h2 className="text-xl font-semibold tracking-tight">What do you need to hear?</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            I&apos;ve read your audit, every task, your check-ins and your penalties. Ask anything. You&apos;ll get the truth and a list of orders.
          </p>
          <div className="mx-auto mt-6 grid max-w-xl gap-2 sm:grid-cols-2">
            {STARTERS.map((s) => (
              <button key={s} onClick={() => send(s)} className="rounded-xl border border-line px-4 py-3 text-left text-sm transition hover:bg-abyss">
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-6 pb-4">
          {state.chat.map((m, i) => (
            <Message key={i} m={m} />
          ))}
          {busy && (
            <div className="flex gap-3">
              <Avatar />
              <div className="min-w-0 flex-1 pt-1 text-[15px] leading-7">
                {streaming ? <Markdown text={streaming} /> : <span className="text-muted animate-pulse">Reading your data…</span>}
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p className="mb-3 rounded-lg border border-flame/30 px-3 py-2 text-sm text-flame">{error}</p>}
      <div ref={endRef} />

      {/* Composer */}
      <form
        className="sticky bottom-20 mt-2 lg:bottom-6"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <div className="flex items-end gap-2 rounded-2xl border border-line bg-surface p-2 pl-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] focus-within:border-ink/30">
          <label htmlFor="cofounder-input" className="sr-only">Message your co-founder</label>
          <textarea
            id="cofounder-input"
            ref={boxRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            placeholder="Ask your co-founder…"
            className="max-h-[200px] min-h-[24px] flex-1 resize-none bg-transparent py-1.5 text-[15px] text-ink outline-none placeholder:text-muted"
          />
          {busy ? (
            <button type="button" onClick={() => ctl.current?.abort()} aria-label="Stop" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink text-obsidian">
              <Square className="h-3 w-3" fill="currentColor" />
            </button>
          ) : (
            <button type="submit" disabled={!input.trim()} aria-label="Send" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink text-obsidian transition disabled:opacity-25">
              <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
            </button>
          )}
        </div>
        <p className="mt-2 text-center text-[11px] text-muted">Blunt by design. It only knows what&apos;s in STARTIT, so keep your check-ins honest.</p>
      </form>
    </div>
  );
}

function Avatar() {
  return (
    <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line">
      <Bot className="h-4 w-4" strokeWidth={1.75} />
    </div>
  );
}

function Message({ m }: { m: ChatMessage }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-abyss px-4 py-2.5 text-[15px] leading-relaxed">{m.content}</div>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <Avatar />
      <div className="min-w-0 flex-1 pt-1 text-[15px] leading-7">
        <Markdown text={m.content} />
      </div>
    </div>
  );
}

/* Minimal, safe markdown: paragraphs, **bold**, _italic_, `code`, "- " and "1. " lists, ### headings. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**")) out.push(<strong key={m.index} className="font-semibold">{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={m.index} className="rounded bg-abyss px-1 py-0.5 font-mono text-[13px]">{t.slice(1, -1)}</code>);
    else out.push(<em key={m.index} className="text-muted">{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r/g, "").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (/^\s*[-*•] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•] /.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*•] /, ""));
      blocks.push(
        <ul key={i} className="my-2 list-disc space-y-1 pl-5 marker:text-muted">
          {items.map((t, k) => <li key={k}>{inline(t)}</li>)}
        </ul>,
      );
      continue;
    }
    if (/^\s*\d+[.)] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)] /.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)] /, ""));
      blocks.push(
        <ol key={i} className="my-2 list-decimal space-y-1 pl-5 marker:text-muted">
          {items.map((t, k) => <li key={k}>{inline(t)}</li>)}
        </ol>,
      );
      continue;
    }
    const h = line.match(/^#{1,4}\s+(.*)/);
    if (h) {
      blocks.push(<p key={i} className="mt-4 font-semibold">{inline(h[1])}</p>);
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^\s*([-*•]|\d+[.)]) /.test(lines[i]) && !/^#{1,4}\s/.test(lines[i])) para.push(lines[i++]);
    blocks.push(
      <p key={i} className="my-2 first:mt-0">
        {para.map((p, k) => (
          <Fragment key={k}>
            {k > 0 && <br />}
            {inline(p)}
          </Fragment>
        ))}
      </p>,
    );
  }
  return <div>{blocks}</div>;
}
