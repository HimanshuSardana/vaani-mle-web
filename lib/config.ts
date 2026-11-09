/** Auth is optional: without Google credentials the app runs entirely as a
 *  guest, and every sign-in affordance is hidden rather than shown broken. */
export const googleEnabled = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
);
