/** Auth is optional: without Google credentials the app runs entirely as a
 *  guest, and every sign-in affordance is hidden rather than shown broken. */
export const googleEnabled = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
);

/** Web search reaches outside the corpus, so it is off unless a deployment opts
 *  in with ENABLE_WEB_SEARCH=1. */
export const webSearchEnabled = process.env.ENABLE_WEB_SEARCH === "1";

/** Recall reads earlier conversations back into the prompt. Off unless
 *  ENABLE_MEMORY_RECALL=1, and when off no turns are stored either. */
export const recallEnabled = process.env.ENABLE_MEMORY_RECALL === "1";

/** "none" asks providers that support it to skip reasoning tokens entirely;
 *  an empty value sends no reasoning parameter at all. */
export const reasoningEffort = process.env.REASONING_EFFORT ?? "none";

/** Models that ignore the parameter can still stream a thinking trace, so the
 *  relay strips those deltas whenever reasoning is meant to be off. */
export const reasoningOff = reasoningEffort.trim() !== "";
