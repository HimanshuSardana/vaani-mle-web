import { type Chunk, loadChunks } from "./corpus";

const K1 = 1.4;
const B = 0.75;
/** Section headings are indexed twice so a query that names a section ranks its chunks. */
const SECTION_WEIGHT = 2;

const STOP = new Set(
  "a about above after again against all am an and any are as at be because been before being below between both but by can did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its itself just me more most my no nor not now of off on once only or other our out over own same she should so some such than that the their theirs them then there these they this those through to too under until up very was we were what when where which while who whom why will with you your".split(
    " ",
  ),
);

function stem(token: string) {
  if (token.length <= 3) return token;
  if (token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.endsWith("ing") && token.length > 5) return token.slice(0, -3);
  if (token.endsWith("ed") && token.length > 4) return token.slice(0, -2);
  if (token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !STOP.has(token))
    .map(stem);
}

type Posting = { doc: number; tf: number };

type Index = {
  postings: Map<string, Posting[]>;
  length: number[];
  avgLength: number;
};

let index: Index | null = null;

function buildIndex(chunks: Chunk[]): Index {
  const postings = new Map<string, Posting[]>();
  const length: number[] = [];

  chunks.forEach((chunk, doc) => {
    // A chunk's heading counts as part of its text, repeatedly.
    const tokens = [...tokenize(chunk.text)];
    const heading = tokenize(chunk.section_path);
    for (let repeat = 0; repeat < SECTION_WEIGHT; repeat += 1) tokens.push(...heading);
    const counts = new Map<string, number>();
    for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);

    for (const [token, tf] of counts) {
      const list = postings.get(token);
      if (list) list.push({ doc, tf });
      else postings.set(token, [{ doc, tf }]);
    }

    length[doc] = tokens.length;
  });

  const total = length.reduce((sum, value) => sum + value, 0);
  return { postings, length, avgLength: total / Math.max(length.length, 1) };
}

export type Hit = { chunk: Chunk; score: number; matched: string[] };

/** Papers by name, so "which optimizer did the Transformer use" cannot drift to
 *  whichever paper happens to use the word "optimizer" more often. */
const NAMED: { pattern: RegExp; paper: string }[] = [
  { pattern: /\b(transformer|attention is all you need|vaswani)\b/, paper: "1706.03762" },
  { pattern: /\b(moshi|mimi|full-duplex|inner monologue)\b/, paper: "2410.00037" },
  { pattern: /\b(h-?net|dynamic chunking|chunk boundar)/, paper: "2507.07955" },
];

/** Only fires when the question names exactly one paper. */
export function paperIntent(query: string): string | null {
  const lower = query.toLowerCase();
  const named = NAMED.filter((entry) => entry.pattern.test(lower));
  return named.length === 1 ? named[0].paper : null;
}

export type RetrieveOptions = {
  limit?: number;
  paper?: string | null;
  /** Cap on passages from one paper, so a comparison question stays a comparison. */
  perPaper?: number;
};

export function retrieve(query: string, options: RetrieveOptions = {}): Hit[] {
  const chunks = loadChunks();
  index ??= buildIndex(chunks);
  const { postings, length, avgLength } = index;

  const terms = [...new Set(tokenize(query))];
  if (terms.length === 0) return [];

  const scores = new Map<number, number>();
  const matched = new Map<number, Set<string>>();

  for (const term of terms) {
    const list = postings.get(term);
    if (!list) continue;

    const idf = Math.log(1 + (chunks.length - list.length + 0.5) / (list.length + 0.5));
    for (const { doc, tf } of list) {
      const norm = K1 * (1 - B + (B * length[doc]) / (avgLength || 1));
      const score = (idf * tf * (K1 + 1)) / (tf + norm);
      scores.set(doc, (scores.get(doc) ?? 0) + score);
      const bag = matched.get(doc) ?? new Set<string>();
      bag.add(term);
      matched.set(doc, bag);
    }
  }

  const phrase = query.trim().toLowerCase();
  if (phrase.length > 12) {
    chunks.forEach((chunk, doc) => {
      if (scores.has(doc) && chunk.text.toLowerCase().includes(phrase)) {
        scores.set(doc, (scores.get(doc) ?? 0) + 2);
      }
    });
  }

  const wanted = options.limit ?? 6;
  const paperFilter = options.paper ?? paperIntent(query);
  const perPaper = options.perPaper ?? Math.max(2, Math.ceil(wanted * 0.6));
  const taken = new Map<string, number>();

  const ranked = [...scores.entries()]
    .filter(([doc]) => !paperFilter || chunks[doc].paper === paperFilter)
    .sort((a, b) => b[1] - a[1]);

  // A passage that scores far below the best one is noise: citing it makes the
  // answer look better sourced than it is.
  const best = ranked[0]?.[1] ?? 0;
  const floor = best * 0.45;

  return ranked
    .filter(([, score]) => score >= floor)
    .filter(([doc]) => {
      const paper = chunks[doc].paper;
      const used = taken.get(paper) ?? 0;
      if (used >= perPaper) return false;
      taken.set(paper, used + 1);
      return true;
    })
    .slice(0, wanted)
    .map(([doc, score]) => ({
      chunk: chunks[doc],
      score: Number(score.toFixed(3)),
      matched: [...(matched.get(doc) ?? [])],
    }));
}

/** Pulls in the chunk after a table, since tables are split from their caption. */
export function expandTables(hits: Hit[], maxExtra = 2): Hit[] {
  if (!hits.length) return hits;

  const chunks = loadChunks();
  const byId = new Map(chunks.map((chunk, doc) => [chunk.chunk_id, doc]));
  const seen = new Set(hits.map((hit) => hit.chunk.chunk_id));
  const extras: Hit[] = [];

  for (const hit of hits) {
    if (!hit.chunk.is_table || extras.length >= maxExtra) continue;
    const next = byId.get(hit.chunk.chunk_id);
    const follower = next === undefined ? undefined : chunks[next + 1];
    if (follower && !seen.has(follower.chunk_id)) {
      seen.add(follower.chunk_id);
      extras.push({ chunk: follower, score: hit.score, matched: [] });
    }
  }

  return [...hits, ...extras].sort((a, b) => {
    if (a.chunk.paper !== b.chunk.paper) return 0;
    return a.chunk.chunk_id.localeCompare(b.chunk.chunk_id);
  });
}
