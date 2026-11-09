export const MODELS = [
  { id: "deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash" },
  { id: "mimo-v2.6-flash", name: "Mimo V2.6 Flash" },
];

/** Anything outside the list falls back to the configured default, so a stale
 *  picker value or a hand-written request cannot reach an unlisted model. */
export function resolveModel(requested?: string) {
  const allowed = MODELS.find((model) => model.id === requested);
  if (allowed) return allowed.id;

  const configured = process.env.OPENAI_MODEL;
  const fallback = MODELS.find((model) => model.id === configured);
  return fallback?.id ?? MODELS[0].id;
}
