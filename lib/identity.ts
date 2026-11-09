const COOKIE = "vaani_owner";

/** Guest memory is scoped to a year-long httpOnly cookie the server owns, so a
 *  reload keeps it without an account. Signing in replaces this with the user id. */
export function ownerFrom(request: Request) {
  const header = request.headers.get("cookie") ?? "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function mintOwner() {
  return `guest_${crypto.randomUUID()}`;
}

export function ownerCookie(owner: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=${encodeURIComponent(owner)}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`;
}
