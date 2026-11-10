import { arxivUrl, paperById } from "./corpus";
import type { Hit } from "./retrieve";

export type Passage = {
  n: number;
  chunk_id: string;
  paper: string;
  short: string;
  title: string;
  section: string;
  pages: string;
  /** Page and file the reader pane opens, plus the raw text it highlights. */
  page: number;
  file: string;
  text: string;
  is_table: boolean;
  score: number;
};

/** The one wording every grounded prompt uses, so the chat route and the RAG
 *  route cannot drift on how strictly the passages are enforced. */
export const GROUNDING_RULES = [
  "You answer questions about three research papers using only the numbered passages you are given.",
  "Those passages are your only source: do not use your own knowledge, and do not add facts, numbers or claims that are not in them.",
  "Cite the passage behind every claim as [1], [2] and so on, right after the sentence it supports.",
  "If the passages do not answer the question, say so in one sentence and name what is missing instead of guessing.",
  "Never invent numbers, section numbers or results that are not in a passage.",
  "Be brief: at most 90 words. For a comparison question, at most 150 words, one short paragraph per paper. No preamble, no restating the question, no closing summary.",
].join(" ");

export const NO_PASSAGES =
  "No passage from the corpus matched this question. Tell the user in one sentence that the three papers do not cover it, and stop.";

export const label = (pas: Passage) => `${pas.short} · ${pas.section} · p.${pas.pages}`;

export function passageBlock(passages: Passage[]) {
  return passages.map((passage) => `[${passage.n}] ${label(passage)}\n${passage.text}`).join("\n\n");
}

export function toPassages(hits: Hit[]): Passage[] {
  return hits.map((hit, index) => {
    const paper = paperById(hit.chunk.paper);
    return {
      n: index + 1,
      chunk_id: hit.chunk.chunk_id,
      paper: hit.chunk.paper,
      short: paper?.short ?? hit.chunk.paper,
      title: paper?.title ?? hit.chunk.paper,
      section: hit.chunk.section_path,
      page: hit.chunk.page_start,
      file: paper?.file ?? "",
      pages:
        hit.chunk.page_start === hit.chunk.page_end
          ? `${hit.chunk.page_start}`
          : `${hit.chunk.page_start}–${hit.chunk.page_end}`,
      text: hit.chunk.text,
      is_table: hit.chunk.is_table,
      score: hit.score,
    };
  });
}

export function toSources(passages: Passage[]) {
  return passages.map((passage) => {
    const paper = paperById(passage.paper);
    return {
      title: `${label(passage)}${passage.is_table ? " · table" : ""}`,
      url: paper ? arxivUrl(paper) : "",
    };
  });
}

export function buildMessages(
  question: string,
  passages: Passage[],
  history: { role: string; content: string }[] = [],
) {
  const turns = history
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-4)
    .map((message) => ({
      role: message.role as "user" | "assistant",
      content: message.content.slice(0, 2000),
    }));

  return [
    { role: "system" as const, content: GROUNDING_RULES },
    ...turns,
    {
      role: "user" as const,
      content: `Passages:\n\n${passageBlock(passages)}\n\nQuestion: ${question}`,
    },
  ];
}

export const NO_MATCH =
  "Nothing in the three papers matches that question closely enough to quote, so I have no grounded answer. Try naming a mechanism, a section, or one of the papers.";
