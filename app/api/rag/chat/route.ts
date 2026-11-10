import { resolvePaper } from "@/lib/rag/corpus";
import {
  DEFAULT_MODEL,
  type ChatMessage,
  complete,
  modelId,
  opencodeConfigured,
  streamCompletion,
} from "@/lib/rag/opencode";
import { NO_MATCH, buildMessages, toPassages, toSources } from "@/lib/rag/prompt";
import { expandTables, retrieve } from "@/lib/rag/retrieve";

type Body = {
  question?: string;
  messages?: { role?: string; content?: unknown }[];
  paper?: string;
  model?: string;
  limit?: number;
  session_id?: string;
  stream?: boolean;
  history?: { role?: string; content?: unknown }[];
};

const error = (message: string, status: number) =>
  Response.json({ error: { message, type: "rag_error", code: status } }, { status });

function lastUserMessage(body: Body) {
  const fromMessages = [...(body.messages ?? [])]
    .reverse()
    .find((message) => message.role === "user");
  const raw = typeof fromMessages?.content === "string" ? fromMessages.content : body.question;
  return typeof raw === "string" ? raw.trim() : "";
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function history(body: Body) {
  return (body.history ?? body.messages ?? [])
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: text(message.role),
      content: typeof message.content === "string" ? message.content : "",
    }))
    .filter((message) => message.content.trim().length > 0);
}

/** Retrieval + a grounded answer, streamed in the same shape the chat UI already
 *  reads: content deltas, plus one `kraken.tool` event carrying the sources. */
export async function POST(request: Request) {
  if (!opencodeConfigured()) {
    return error("Set OPENCODE_API_KEY to use the RAG endpoint.", 503);
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body) return error("Expected a JSON body.", 400);

  const question = lastUserMessage(body);
  if (!question) return error("`question` or a user message is required.", 400);

  const paper = resolvePaper(body.paper);
  if (body.paper && !paper) {
    return error("`paper` must be an arXiv id, or one of Attention, Moshi, H-Net.", 400);
  }

  const asked = Math.min(Math.max(Number(body.limit) || 6, 1), 12);
  const hits = expandTables(retrieve(question, { limit: asked, paper }));
  const passages = toPassages(hits);
  const sources = toSources(passages);
  const model = modelId(body.model) || DEFAULT_MODEL;
  const messages: ChatMessage[] =
    passages.length > 0
      ? buildMessages(question, passages, history(body))
      : [];

  if (body.stream === false) {
    if (passages.length === 0) {
      return Response.json({ answer: NO_MATCH, model, sources: [], passages: [] });
    }

    try {
      const reply = await complete({
        model,
        messages,
        session: body.session_id,
        signal: request.signal,
      });
      return Response.json({
        answer: reply.content || NO_MATCH,
        model,
        usage: reply.usage,
        sources,
        passages,
      });
    } catch (cause) {
      return error(cause instanceof Error ? cause.message : "Upstream failure.", 502);
    }
  }

  const id = `chatcmpl-${crypto.randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));

      const chunk = (delta: object, finish: string | null = null) => ({
        id,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [{ index: 0, delta, finish_reason: finish }],
      });

      send(chunk({ role: "assistant", content: "" }));
      send({
        ...chunk({}),
        kraken: {
          tool: { name: "retrieve", query: question, results: passages.length, sources },
        },
      });
      send({ ...chunk({}), rag: { passages } });

      const finish = () => {
        send(chunk({}, "stop"));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      };

      if (passages.length === 0) {
        send(chunk({ content: NO_MATCH }));
        finish();
        return;
      }

      try {
        const upstream = await streamCompletion({
          model,
          messages,
          session: body.session_id,
          signal: request.signal,
        });

        if (!upstream.ok || !upstream.body) {
          const detail = (await upstream.text()).slice(0, 300);
          send(chunk({ content: `The model rejected the request (${upstream.status}). ${detail}` }));
          finish();
          return;
        }

        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";

          for (const event of events) {
            const line = event.trim();
            if (!line.startsWith("data:")) continue;

            const payload = line.slice(5).trim();
            if (payload === "[DONE]") continue;

            let parsed: { choices?: { delta?: { content?: string } }[] };
            try {
              parsed = JSON.parse(payload);
            } catch {
              continue;
            }

            const delta = parsed.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta.length > 0) send(chunk({ content: delta }));
          }
        }

        finish();
      } catch (cause) {
        if (request.signal.aborted) return;
        send(
          chunk({
            content:
              cause instanceof Error
                ? `The answer stopped early: ${cause.message}`
                : "The answer stopped early.",
          }),
        );
        finish();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Rag-Model": model,
      "X-Rag-Passages": String(passages.length),
    },
  });
}

export async function GET() {
  return Response.json({
    object: "rag.endpoint",
    usage: {
      method: "POST",
      body: {
        question: "string (or messages: [{role, content}])",
        paper: "1706.03762 | 2410.00037 | 2507.07955 (optional)",
        model: "opencode go model id (optional)",
        limit: "passages to retrieve, 1-12, default 6",
        stream: "true (default) streams SSE, false returns JSON",
      },
    },
    configured: opencodeConfigured(),
    model: DEFAULT_MODEL,
  });
}
