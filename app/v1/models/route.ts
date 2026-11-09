import { MODELS } from "@/lib/models";

export async function GET() {
  return Response.json({
    object: "list",
    data: MODELS.map(({ id, name }) => ({
      id,
      object: "model",
      created: 0,
      owned_by: "recall",
      name,
    })),
  });
}
