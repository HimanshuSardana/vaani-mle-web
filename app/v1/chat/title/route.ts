import { titleFrom } from "@/lib/chat";
import { resolveModel } from "@/lib/models";

const BASE_URL = process.env.OPENAI_BASE_URL?.replace(/\/+$/, "");
const API_KEY = process.env.OPENAI_API_KEY;

const INSTRUCTIONS = [
  "You name chat threads.",
  "Reply with a title of at most six words in sentence case.",
  "No quotes, no markdown, no trailing punctuation.",
].join(" ");

function tidy(raw: string) {
  return raw
    .replace(/^[\s"'`*_#]+|[\s"'`*_.]+$/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 60);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { message?: unknown } | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";

  if (!message) {
    return Response.json(
      { error: { message: "`message` is required.", type: "invalid_request_error" } },
      { status: 400 },
    );
  }

  const fallback = titleFrom(message);

  if (!BASE_URL || !API_KEY) {
    return Response.json({ title: fallback });
  }

  try {
    const upstream = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
        "x-opencode-session": crypto.randomUUID(),
      },
      body: JSON.stringify({
        model: resolveModel(),
        stream: false,
        messages: [
          { role: "system", content: INSTRUCTIONS },
          { role: "user", content: message },
        ],
      }),
    });

    if (upstream.ok) {
      const payload = await upstream.json();
      const raw = payload.choices?.[0]?.message?.content;
      if (typeof raw === "string") {
        const title = tidy(raw);
        if (title) return Response.json({ title });
      }
    }
  } catch {
    // Any provider hiccup just leaves the provisional title in place.
  }

  return Response.json({ title: fallback });
}
