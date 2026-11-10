import { memoryOwner } from "@/lib/auth";
import { recallEnabled, reasoningEffort, reasoningOff, webSearchEnabled } from "@/lib/config";
import { recallTurns, recentAsks, rememberTurn } from "@/lib/memory";
import { resolveModel } from "@/lib/models";
import {
  GROUNDING_RULES,
  NO_PASSAGES,
  type Passage,
  passageBlock,
  toPassages,
} from "@/lib/rag/prompt";
import { expandTables, retrieve } from "@/lib/rag/retrieve";
import { webSearch } from "@/lib/search";

type ChatMessage = { role: string; content: unknown };

type ChatRequest = {
  model?: string;
  messages?: ChatMessage[];
  stream?: unknown;
  session_id?: string;
  chat_id?: string;
  tools?: unknown;
};

type ToolCall = { id: string; name: string; arguments: string };

const BASE_URL = process.env.OPENAI_BASE_URL?.replace(/\/+$/, "");
const API_KEY = process.env.OPENAI_API_KEY;

const FINAL_NUDGE =
  "Searching is done. Answer the original question now, in prose, using the results above. Do not call any tool.";

type ToolEvent = {
  name: string;
  query: string;
  results: number;
  sources: { title: string; url: string }[];
};

const WEB_SEARCH = {
  type: "function",
  function: {
    name: "web_search",
    description:
      "Search the public web. Use it for anything after your training cutoff, current events, prices, releases, or facts you are not sure about. Returns titles, URLs and snippets. Search once, twice only if the results are unusable, then answer with what you have.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query, phrased like a search engine query." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
};

const RECALL = {
  type: "function",
  function: {
    name: "recall",
    description:
      "Search this user's earlier conversations, including other chats. Use it whenever they refer to something from before — “last Tuesday”, “on 3 November”, “what did I ask”, “the CRM shortlist” — and never invent what they asked.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keywords to look for in earlier turns." },
        from: { type: "string", description: "Inclusive start date, YYYY-MM-DD." },
        to: { type: "string", description: "Inclusive end date, YYYY-MM-DD." },
      },
      additionalProperties: false,
    },
  },
};

const day = (at: number) => new Date(at).toISOString().slice(0, 10);

/** Advertised tools. Empty means the loop below has nothing to call. */
const TOOLS = [...(webSearchEnabled ? [WEB_SEARCH] : []), ...(recallEnabled ? [RECALL] : [])];

function promptFor(owner: string, passages: Passage[]) {
  const tools = [
    webSearchEnabled ? "web search" : null,
    recallEnabled ? "recall of earlier conversations" : null,
  ].filter(Boolean);

  const lines = [
    "You are vaani, answering questions about three research papers: Attention Is All You Need, Moshi, and H-Net (Dynamic Chunking).",
    GROUNDING_RULES,
    `Today is ${day(Date.now())} (UTC).`,
    passages.length
      ? `Passages:\n\n${passageBlock(passages)}`
      : NO_PASSAGES,
  ];

  if (tools.length) {
    lines.splice(1, 0, `You also have these tools: ${tools.join(" and ")}.`);
  }

  if (recallEnabled) {
    const asks = recentAsks(owner, 5);

    if (asks.length) {
      lines.push(
        `Recent questions from this user, oldest first:\n${asks
          .map((ask) => `- ${day(ask.at)} — ${ask.text.slice(0, 140)}`)
          .join("\n")}`,
      );
    }

    lines.push(
      "Resolve relative dates against today. Use recall for anything that happened before this chat; use web search for anything that may have changed. Do not state what the user asked without checking recall first.",
    );
  }

  return lines.join("\n\n");
}

function messageText(content: unknown) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part === "object" && "text" in part ? String(part.text) : ""))
      .join(" ")
      .trim();
  }
  return "";
}

function withOwner(response: Response, cookie: string | null) {
  if (!cookie) return response;
  const headers = new Headers(response.headers);
  headers.append("set-cookie", cookie);
  return new Response(response.body, { status: response.status, headers });
}

function invalid(message: string) {
  return Response.json(
    { error: { message, type: "invalid_request_error", param: null, code: null } },
    { status: 400 },
  );
}

function mockReply(messages: ChatMessage[]) {
  const lastUser = [...messages]
    .reverse()
    .find((message) => message.role === "user" && typeof message.content === "string");

  const said = typeof lastUser?.content === "string" ? lastUser.content.trim() : "";
  const gist = said.length > 140 ? `${said.slice(0, 140)}…` : said;

  return [
    "This is a mock reply, no model is wired up yet.",
    gist ? `You said: "${gist}".` : "I could not find a question in that request.",
    "Set OPENAI_API_KEY and OPENAI_BASE_URL to talk to a real provider.",
  ].join(" ");
}

function sseHeaders() {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
  };
}

/** Forwards deltas to the client while collecting any tool call the model asks for. */
/** A model that ignores reasoning_effort still streams its thinking; the UI has
 *  nothing to do with it, so the delta never reaches the client. */
function stripReasoning(delta: Record<string, unknown>) {
  const copy = { ...delta };
  for (const key of ["reasoning", "reasoning_content", "reasoning_details"]) delete copy[key];
  return copy;
}

async function relay(
  body: ReadableStream<Uint8Array>,
  emit: (delta: object) => void,
): Promise<{ content: string; calls: ToolCall[] }> {  const reader = body.getReader();
  const decoder = new TextDecoder();
  const calls = new Map<number, ToolCall>();
  let buffer = "";
  let content = "";

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

      let chunk: {
        choices?: {
          delta?: {
            content?: string | null;
            tool_calls?: {
              index?: number;
              id?: string;
              function?: { name?: string; arguments?: string };
            }[];
          };
        }[];
      };

      try {
        chunk = JSON.parse(payload);
      } catch {
        continue;
      }

      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;

      if (delta.tool_calls?.length) {
        for (const call of delta.tool_calls) {
          const index = call.index ?? 0;
          const entry = calls.get(index) ?? { id: "", name: "", arguments: "" };
          if (call.id) entry.id = call.id;
          if (call.function?.name) entry.name = call.function.name;
          if (call.function?.arguments) entry.arguments += call.function.arguments;
          calls.set(index, entry);
        }
        continue;
      }

      if (typeof delta.content === "string" && delta.content) {
        content += delta.content;
      }

      emit(reasoningOff ? stripReasoning(delta as Record<string, unknown>) : delta);
    }
  }

  return { content, calls: [...calls.values()].filter((call) => call.name) };
}

export async function POST(request: Request) {
  let body: ChatRequest;
  try {
    body = await request.json();
  } catch {
    return invalid("Request body must be JSON.");
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return invalid("`messages` must be a non-empty array.");
  }

  const model = resolveModel(body.model);
  const history: ChatMessage[] = body.messages;

  const { owner, cookie: setCookie } = await memoryOwner(request);
  const chat = body.chat_id || "default";

  const lastTurn = history.at(-1);
  const asked = lastTurn?.role === "user" ? messageText(lastTurn.content) : "";
  if (asked && recallEnabled) rememberTurn({ owner, chat, role: "user", text: asked });

  if (!BASE_URL || !API_KEY) {
    const id = `chatcmpl-${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`;
    const created = Math.floor(Date.now() / 1000);
    const reply = mockReply(body.messages);

    if (body.stream === false) {
      return withOwner(Response.json({
        id,
        object: "chat.completion",
        created,
        model,
        choices: [
          { index: 0, message: { role: "assistant", content: reply }, finish_reason: "stop" },
        ],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      }), setCookie);
    }

    const encoder = new TextEncoder();
    const tokens = reply.match(/\S+\s*/g) ?? [];
    const stream = new ReadableStream({
      async start(controller) {
        const chunk = (delta: object, finishReason: string | null = null) => ({
          id,
          object: "chat.completion.chunk",
          created,
          model,
          choices: [{ index: 0, delta, finish_reason: finishReason }],
        });
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(chunk({ role: "assistant", content: "" }))}\n\n`),
        );
        for (const token of tokens) {
          await new Promise((resolve) => setTimeout(resolve, 18));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk({ content: token }))}\n\n`));
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk({}, "stop"))}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return withOwner(new Response(stream, { headers: sseHeaders() }), setCookie);
  }

  const upstreamHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${API_KEY}`,
    "x-opencode-session": body.session_id || crypto.randomUUID(),
  };

  // Providers that honour reasoning_effort stop thinking at the source; the ones
  // that ignore it are handled by stripping their trace in the relay.
  const reasoning = reasoningEffort.trim() ? { reasoning_effort: reasoningEffort.trim() } : {};
  const toolPayload = TOOLS.length ? { tools: TOOLS, tool_choice: "auto" } : {};
  const upstreamBody = (extra: Record<string, unknown>) =>
    JSON.stringify({ ...body, ...reasoning, model, ...extra });

  const passages = toPassages(asked ? expandTables(retrieve(asked, { limit: 5 })) : []);
  const guided = [
    { role: "system", content: promptFor(owner, passages) },
    ...history,
  ];

  // A client that brings its own tools is proxied untouched; we only drive the
  // loop for the tool we advertise.
  if (body.tools) {
    const upstream = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      cache: "no-store",
      headers: upstreamHeaders,
      body: JSON.stringify({ ...body, model }),
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") ?? "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  }

  if (body.stream === false) {
    // Non-streaming callers get the loop run to completion, then one JSON reply.
    const messages: unknown[] = [...guided];
    let answer = "";

    for (let round = 0; round < 3; round += 1) {
      const upstream = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        cache: "no-store",
        headers: upstreamHeaders,
        body: upstreamBody({ stream: false, messages, ...toolPayload }),
      });

      if (!upstream.ok) {
        return new Response(await upstream.text(), {
          status: upstream.status,
          headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
        });
      }

      const payload = (await upstream.json()) as {
        choices?: {
          message?: {
            content?: string | null;
            tool_calls?: { id: string; function?: { name?: string; arguments?: string } }[];
          };
        }[];
      };
      const message = payload.choices?.[0]?.message;
      const calls = (message?.tool_calls ?? [])
        .filter((call) => call.function?.name === "web_search")
        .map((call) => ({
          id: call.id,
          name: "web_search",
          arguments: call.function?.arguments ?? "{}",
        }));

      if (calls.length === 0) {
        answer = message?.content ?? "";
        break;
      }

      messages.push({ role: "assistant", content: message?.content ?? null, tool_calls: message?.tool_calls });
      const { messages: toolMessages } = await runToolCalls(calls, owner);
      messages.push(...toolMessages);
    }

    if (!answer) {
      // Out of rounds while still asking to search. The tool stays advertised:
      // withholding it makes this model emit raw tool-call syntax as text, so a
      // nudge turn is what actually ends the loop.
      messages.push({ role: "user", content: FINAL_NUDGE });

      const upstream = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        cache: "no-store",
        headers: upstreamHeaders,
        body: upstreamBody({ stream: false, messages, ...toolPayload }),
      });

      if (upstream.ok) {
        const payload = (await upstream.json()) as {
          choices?: { message?: { content?: string | null } }[];
        };
        answer = payload.choices?.[0]?.message?.content ?? "";
      }
    }

    if (answer) {
      if (recallEnabled) rememberTurn({ owner, chat, role: "assistant", text: answer });
    }

    return withOwner(Response.json({
      id: `chatcmpl-${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{ index: 0, message: { role: "assistant", content: answer }, finish_reason: "stop" }],
      rag: { passages },
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    }), setCookie);
  }

  const encoder = new TextEncoder();
  const id = `chatcmpl-${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`;
  const created = Math.floor(Date.now() / 1000);

  const relayStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      const chunk = (delta: object, finishReason: string | null = null) => ({
        id,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [{ index: 0, delta, finish_reason: finishReason }],
      });

      const messages: unknown[] = [...guided];
      let started = false;
      let answered = false;
      let answer = "";

      for (let round = 0; round < 3; round += 1) {
        const upstream = await fetch(`${BASE_URL}/chat/completions`, {
          method: "POST",
          cache: "no-store",
          headers: upstreamHeaders,
          body: upstreamBody({ messages, stream: true, ...toolPayload }),
        });

        if (!upstream.ok || !upstream.body) {
          send(
            chunk({
              content: `The provider rejected the request (${upstream.status}).`,
            }),
          );
          break;
        }

        if (!started) {
          send(chunk({ role: "assistant", content: "" }));
          send({ ...chunk({}), rag: { passages } });
          started = true;
        }

        const { content, calls } = await relay(upstream.body, (delta) => {
          if (typeof (delta as { content?: string }).content === "string") {
            answer += (delta as { content: string }).content;
          }
          send(chunk(delta));
        });

        if (calls.length === 0) {
          answered = true;
          break;
        }

        // The model's preamble and the next round's answer would otherwise
        // arrive glued together.
        if (content.trim()) send(chunk({ content: "\n\n" }));

        messages.push({
          role: "assistant",
          content: content || null,
          tool_calls: calls.map((call) => ({
            id: call.id,
            type: "function",
            function: { name: call.name, arguments: call.arguments },
          })),
        });

        const { messages: toolMessages, events } = await runToolCalls(calls, owner);
        messages.push(...toolMessages);

        for (const event of events) {
          send({
            id,
            object: "chat.completion.chunk",
            created,
            model,
            choices: [{ index: 0, delta: {}, finish_reason: null }],
            kraken: { tool: event },
          });
        }

        answered = false;
      }

      if (!answered) {
        messages.push({ role: "user", content: FINAL_NUDGE });

        const last = await fetch(`${BASE_URL}/chat/completions`, {
          method: "POST",
          cache: "no-store",
          headers: upstreamHeaders,
          body: upstreamBody({ messages, stream: true, ...toolPayload }),
        });

        if (last.ok && last.body) {
          await relay(last.body, (delta) => send(chunk(delta)));
        }
      }

      send(chunk({}, "stop"));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();

      if (answer.trim() && recallEnabled) {
        rememberTurn({ owner, chat, role: "assistant", text: answer });
      }
    },
  });

  return withOwner(new Response(relayStream, { headers: sseHeaders() }), setCookie);
}

async function runToolCalls(calls: ToolCall[], owner: string) {
  const messages: { role: "tool"; tool_call_id: string; content: string }[] = [];
  const events: ToolEvent[] = [];

  for (const call of calls) {
    let payload: unknown;
    let query = "";

    try {
      const args = JSON.parse(call.arguments) as { query?: unknown; from?: unknown; to?: unknown };
      query = typeof args.query === "string" ? args.query : "";

      if (call.name === "recall") {
        const turns = recallTurns({
          owner,
          query: query || undefined,
          from: typeof args.from === "string" ? args.from : undefined,
          to: typeof args.to === "string" ? args.to : undefined,
        });

        payload = {
          turns: turns.map((turn) => ({
            at: day(turn.at),
            role: turn.role,
            text: turn.text,
          })),
        };
      } else {
        payload = { results: await webSearch(query) };
      }
    } catch (error) {
      payload = { error: error instanceof Error ? error.message : "Tool failed." };
    }

    const found = (payload as { results?: { title?: string; url?: string }[] }).results ?? [];
    const recalled = (payload as { turns?: unknown[] }).turns ?? [];

    events.push({
      name: call.name,
      query,
      results: call.name === "recall" ? recalled.length : found.length,
      sources: found.slice(0, 4).map((source) => ({
        title: source.title ?? "",
        url: source.url ?? "",
      })),
    });

    messages.push({
      role: "tool",
      tool_call_id: call.id,
      content: JSON.stringify(payload),
    });
  }

  return { messages, events };
}
