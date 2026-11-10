import { opencodeConfigured, listModels } from "@/lib/rag/opencode";

/** The models the gateway will answer with — the ids this API accepts. */
export async function GET() {
  if (!opencodeConfigured()) {
    return Response.json(
      { error: { message: "Set OPENCODE_API_KEY to list models.", type: "rag_error" } },
      { status: 503 },
    );
  }

  try {
    const models = await listModels();
    return Response.json({ object: "list", data: models.map((model) => ({ ...model, object: "model" })) });
  } catch (cause) {
    return Response.json(
      {
        error: {
          message: cause instanceof Error ? cause.message : "Could not list models.",
          type: "rag_error",
        },
      },
      { status: 502 },
    );
  }
}
