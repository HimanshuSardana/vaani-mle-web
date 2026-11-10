import { readFileSync } from "node:fs";
import path from "node:path";

export type Chunk = {
  chunk_id: string;
  paper: string;
  version: string;
  section_path: string;
  page_start: number;
  page_end: number;
  text: string;
  is_table: boolean;
};

export type Paper = {
  arxiv: string;
  short: string;
  title: string;
  version: string;
  /** Static copy served from /public for the reader pane. */
  file: string;
};

/** The three papers the corpus covers, in the order they are cited. */
export const PAPERS: Paper[] = [
  {
    arxiv: "1706.03762",
    version: "v7",
    short: "Attention",
    title: "Attention Is All You Need",
    file: "/papers/1706.03762v7-attention-is-all-you-need.pdf",
  },
  {
    arxiv: "2410.00037",
    version: "v1",
    short: "Moshi",
    title: "Moshi: A Speech-Text Foundation Model for Real-Time Dialogue",
    file: "/papers/2410.00037v1-moshi.pdf",
  },
  {
    arxiv: "2507.07955",
    version: "v2",
    short: "H-Net",
    title: "Dynamic Chunking for End-to-End Hierarchical Sequence Modeling",
    file: "/papers/2507.07955v2-dynamic-chunking.pdf",
  },
];

export const paperById = (id: string) => PAPERS.find((paper) => paper.arxiv === id) ?? null;

/** Resolves "moshi", "H-Net", "2410.00037" and case variants to the arXiv id. */
export function resolvePaper(input?: string | null) {
  if (!input) return null;
  const needle = input.trim().toLowerCase();
  const match = PAPERS.find(
    (paper) =>
      paper.arxiv === needle ||
      paper.short.toLowerCase() === needle ||
      paper.title.toLowerCase() === needle,
  );
  return match?.arxiv ?? null;
}

export function arxivUrl(paper: Paper, page?: number) {
  return `https://arxiv.org/abs/${paper.arxiv}${paper.version}${page ? `#page=${page}` : ""}`;
}

const CORPUS = path.join(process.cwd(), "lib", "rag", "corpus.jsonl");

let cache: Chunk[] | null = null;

/** Parsed once per server process: the file is small and immutable at runtime. */
export function loadChunks(): Chunk[] {
  if (cache) return cache;

  cache = readFileSync(CORPUS, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Chunk);

  return cache;
}

/** Chunks keep their document order, so a neighbour is the chunk before or after. */
export function chunkIndex(chunks: Chunk[]) {
  const byId = new Map<string, Chunk>();
  const order = new Map<string, number>();
  chunks.forEach((chunk, index) => {
    byId.set(chunk.chunk_id, chunk);
    order.set(chunk.chunk_id, index);
  });
  return { byId, order };
}
