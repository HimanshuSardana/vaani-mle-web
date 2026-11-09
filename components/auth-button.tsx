"use client";

import { authClient } from "@/lib/auth-client";

export function AuthButton({
  className,
  signedOutLabel = "Sign in with Google",
  signedInLabel,
}: {
  className?: string;
  signedOutLabel?: string;
  signedInLabel?: string;
}) {
  const { data, isPending } = authClient.useSession();

  if (isPending) return <span className={className}>…</span>;

  if (!data) {
    return (
      <button
        type="button"
        className={className}
        onClick={() =>
          authClient.signIn.social({ provider: "google", callbackURL: "/" })
        }
      >
        {signedOutLabel}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={className}
      title={data.user.email}
      onClick={() =>
        authClient.signOut({ fetchOptions: { onSuccess: () => window.location.reload() } })
      }
    >
      {signedInLabel ?? data.user.name ?? "Sign out"}
    </button>
  );
}
