import { MODELS, PROVIDERS } from "@/lib/models";

export async function GET() {
  return Response.json({
    object: "list",
    data: MODELS.map(({ id, name, provider }) => ({
      id,
      object: "model",
      created: 0,
      owned_by: provider,
      name,
      provider: PROVIDERS[provider].label,
    })),
  });
}
