import { resolvePaper } from "@/lib/rag/corpus";
import { toPassages } from "@/lib/rag/prompt";
import { expandTables, retrieve } from "@/lib/rag/retrieve";

/** Retrieval on its own — no model call, for inspecting what the answer would see. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  if (!query) {
    return Response.json(
      { error: { message: "Pass ?q=<question>", type: "invalid_request_error" } },
      { status: 400 },
    );
  }

  const paper = resolvePaper(url.searchParams.get("paper"));
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 8, 1), 24);
  const hits = expandTables(retrieve(query, { limit, paper }));

  return Response.json({
    query,
    paper,
    passages: toPassages(hits).map((passage) => ({
      n: passage.n,
      chunk_id: passage.chunk_id,
      paper: passage.short,
      section: passage.section,
      pages: passage.pages,
      score: passage.score,
      is_table: passage.is_table,
      text: passage.text,
    })),
  });
}
