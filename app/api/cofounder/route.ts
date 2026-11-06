/**
 * POST /api/cofounder
 * Body: { messages: {role: "user" | "assistant", content: string}[] }  (first turn = rules + dossier)
 * Streams the co-founder's answer back as plain text.
 *
 * Needs ANTHROPIC_API_KEY in .env.local. Model is configurable with COFOUNDER_MODEL.
 */
import { COFOUNDER_RULES } from "@/lib/cofounder";
import { guard } from "@/lib/server/guard";
import type { QuotaKind } from "@/lib/plans";

export const runtime = "nodejs";

type Msg = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return new Response("ANTHROPIC_API_KEY is not set", { status: 501 });

  let messages: Msg[];
  let mode: "chat" | "json" = "chat";
  let purpose: QuotaKind = "chat";
  try {
    const body = await req.clone().json();
    if (body?.mode === "json") mode = "json";
    if (["chat", "research", "plan", "update"].includes(body?.purpose)) purpose = body.purpose;
    else if (mode === "json") purpose = "research";
    messages = (Array.isArray(body?.messages) ? body.messages : [])
      .filter((m: Msg) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .slice(-14)
      .map((m: Msg) => ({ role: m.role, content: m.content.slice(0, 60_000) }));
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  // Signed-in users only, within their plan's daily limit for this kind of request.
  const caller = await guard(req, purpose);
  if (caller instanceof Response) return caller;

  if (!messages.length || messages[0].role !== "user" || messages[messages.length - 1].role !== "user") {
    return new Response("messages must start and end with a user turn", { status: 400 });
  }

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.COFOUNDER_MODEL || "claude-sonnet-5-5",
      max_tokens: mode === "json" ? 4000 : 1200,
      system: mode === "json" ? "Reply with only valid JSON. No prose, no code fences." : COFOUNDER_RULES,
      messages,
      stream: true,
    }),
    signal: req.signal,
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return new Response(`Upstream error ${upstream.status}: ${detail.slice(0, 300)}`, { status: 502 });
  }

  // Convert Anthropic's server-sent events into a plain text stream of the answer.
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = upstream.body.getReader();
  let buffer = "";

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const evt of events) {
        const data = evt.split("\n").find((l) => l.startsWith("data: "))?.slice(6);
        if (!data) continue;
        try {
          const json = JSON.parse(data);
          if (json.type === "content_block_delta" && json.delta?.type === "text_delta") {
            controller.enqueue(encoder.encode(json.delta.text));
          } else if (json.type === "error") {
            controller.error(new Error(json.error?.message ?? "stream error"));
            return;
          }
        } catch {
          /* ignore keep-alives and partial lines */
        }
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });

  return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
