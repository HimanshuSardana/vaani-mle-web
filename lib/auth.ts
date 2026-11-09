import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { googleEnabled } from "@/lib/config";
import { mintOwner, ownerCookie, ownerFrom } from "@/lib/identity";

const google = googleEnabled
  ? {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      },
    }
  : undefined;

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "sqlite", schema }),
  secret: process.env.BETTER_AUTH_SECRET ?? "dev-only-secret-change-me",
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  socialProviders: google,
  session: { cookieCache: { enabled: true, maxAge: 60 } },
});

/** The signed-in user for a request, or null for a guest. */
export async function sessionUser(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user ?? null;
}

/** Who owns memories, chats and turns: the user when signed in, else the
 *  guest cookie (minted on this response when they have none). */
export async function memoryOwner(request: Request) {
  const user = await sessionUser(request);
  if (user) return { owner: user.id, cookie: null as string | null };

  const existing = ownerFrom(request);
  const owner = existing ?? mintOwner();
  return { owner, cookie: existing ? null : ownerCookie(owner) };
}
