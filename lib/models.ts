export type ProviderId = "opencode-go" | "groq";

/** Two OpenAI-compatible gateways. The provider is part of the model's identity:
 *  it decides the base URL, the key, and whether the opencode session header is
 *  required (the go gateway rejects requests without it). */
export const PROVIDERS: Record<
  ProviderId,
  {
    label: string;
    baseUrl: string;
    keyEnv: string;
    /** The go gateway routes on x-opencode-session; Groq rejects unknown headers. */
    session: boolean;
    /** Groq only accepts low|medium|high, so "no reasoning" becomes "low". */
    reasoningFloor: boolean;
  }
> = {
  "opencode-go": {
    label: "Opencode Go",
    baseUrl: (process.env.OPENAI_BASE_URL ?? "https://opencode.ai/inference/go/openai/v1").replace(
      /\/+$/,
      "",
    ),
    keyEnv: "OPENAI_API_KEY",
    session: true,
    reasoningFloor: false,
  },
  groq: {
    label: "Groq",
    baseUrl: (process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1").replace(/\/+$/, ""),
    keyEnv: "GROQ_API_KEY",
    session: false,
    reasoningFloor: true,
  },
};

export type Model = { id: string; name: string; provider: ProviderId };

export const MODELS: Model[] = [
  { id: "deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash", provider: "opencode-go" },
  { id: "mimo-v2.6-flash", name: "Mimo V2.6 Flash", provider: "opencode-go" },
  { id: "openai/gpt-oss-20b", name: "GPT OSS 20B", provider: "groq" },
];

/** Anything outside the list falls back to the configured default, so a stale
 *  picker value or a hand-written request cannot reach an unlisted model. */
export function resolveModel(requested?: string): Model {
  const allowed = MODELS.find((model) => model.id === requested);
  if (allowed) return allowed;

  const configured = process.env.OPENAI_MODEL;
  return MODELS.find((model) => model.id === configured) ?? MODELS[0];
}

export function providerFor(model: Model) {
  const provider = PROVIDERS[model.provider];
  return { ...provider, key: process.env[provider.keyEnv] ?? "" };
}

/** Whether any provider is usable at all — without a key the routes answer with
 *  a canned reply instead of a network error. */
export function anyProviderConfigured() {
  return MODELS.some((model) => Boolean(providerFor(model).key));
}
