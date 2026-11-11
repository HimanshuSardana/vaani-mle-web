/** Starting questions the empty composer cycles through. They are prompts, not
 *  a whitelist — the field takes any question about the three papers. */
export const PROMPT_SUGGESTIONS = [
  "How does scaled dot-product attention differ from additive attention?",
  "Why did the transformer drop recurrence entirely?",
  "What makes Moshi full-duplex instead of turn-based?",
  "How does Moshi's inner monologue improve what it says?",
  "How does H-Net learn chunk boundaries without a tokenizer?",
  "How does dynamic chunking scale against a BPE baseline?",
  "Where do Moshi and the Transformer disagree about attention cost?",
  "Compare how the three papers handle long sequences.",
];

export const PROMPT_ROTATE_MS = 3200;
