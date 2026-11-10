/** Client for the opencode go gateway, which is OpenAI-compatible but routes on
 *  the `x-opencode-session` header — without it every request is rejected. */

const BASE_URL = (
  process.env.OPENCODE_BASE_URL ?? "https://opencode.ai/inference/go/openai/v1"
).replace(/\/+$/, "");

export const DEFAULT_MODEL = process.env.RAG_MODEL ?? "deepseek-v4.1-flash";
const DEFAULT_SESSION = process.env.OPENCODE_SESSION ?? "vaani-rag";
const TIMEOUT_MS = 120_000;

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export const opencodeConfigured = () => Boolean(process.env.OPENCODE_API_KEY);

export function modelId(requested?: string | null) {
  const clean = requested?.trim();
  return clean ? clean : DEFAULT_MODEL;
}

function headers(session?: string | null) {
  return {
    Authorization: `Bearer ${process.env.OPENCODE_API_KEY ?? ""}`,
    "Content-Type": "application/json",
    "x-opencode-session": session?.trim() || DEFAULT_SESSION,
  };
}

function signalFor(signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export async function streamCompletion(options: {
  model: string;
  messages: ChatMessage[];
  session?: string | null;
  signal?: AbortSignal;
  maxTokens?: number;
}) {
  return fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    cache: "no-store",
    headers: headers(options.session),
    signal: signalFor(options.signal),
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      stream: true,
      max_tokens: options.maxTokens ?? 1200,
    }),
  });
}

export async function complete(options: {
  model: string;
  messages: ChatMessage[];
  session?: string | null;
  signal?: AbortSignal;
  maxTokens?: number;
}) {
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    cache: "no-store",
    headers: headers(options.session),
    signal: signalFor(options.signal),
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      stream: false,
      max_tokens: options.maxTokens ?? 1200,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`opencode ${response.status}: ${text.slice(0, 300)}`);
  }

  const payload = JSON.parse(text) as {
    choices?: { message?: { content?: string } }[];
    usage?: unknown;
  };

  return {
    content: payload.choices?.[0]?.message?.content ?? "",
    usage: payload.usage ?? null,
  };
}

type ModelEntry = { id?: string; name?: string; type?: string };

let modelsCache: { at: number; models: { id: string; name: string }[] } | null = null;

/** The gateway lists ~30 chat models; embeddings are not offered, so retrieval is
 *  lexical and only generation leaves the machine. */
export async function listModels() {
  if (modelsCache && Date.now() - modelsCache.at < 10 * 60_000) return modelsCache.models;

  const response = await fetch(`${BASE_URL}/models`, {
    cache: "no-store",
    headers: headers(),
    signal: signalFor(),
  });

  if (!response.ok) {
    throw new Error(`opencode ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }

  const payload = (await response.json()) as { data?: ModelEntry[] };
  const models = (payload.data ?? [])
    .filter((model) => model.type === "chat" && model.id)
    .map((model) => ({ id: model.id as string, name: model.name ?? (model.id as string) }))
    .sort((a, b) => a.id.localeCompare(b.id));

  modelsCache = { at: Date.now(), models };
  return models;
}
