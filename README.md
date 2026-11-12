# vaani

A reading assistant over three papers, with a citation you can open.

Ask a question and the answer is written only from the passages retrieved out of
the corpus — every claim carries a marker like `[2]`, and clicking it opens the
paper in a reader beside the chat, scrolled to the page and with the passage
itself highlighted.

**Corpus**

- Attention Is All You Need — 1706.03762v7
- Moshi: A Speech-Text Foundation Model for Real-Time Dialogue — 2410.00037v1
- Dynamic Chunking for End-to-End Hierarchical Sequence Modeling — 2507.07955v2

## How it works

1. **Retrieve** — `lib/rag/retrieve.ts` builds a BM25 index over 317 chunks once
   per process, weights section headings, filters passages that score far below
   the best hit, caps how many come from one paper, and honours a paper named in
   the question ("the Transformer", Moshi, H-Net).
2. **Answer** — `lib/rag/prompt.ts` hands the numbered passages to a model on the
   opencode go gateway with one instruction: those passages are the only source,
   cite them, and say so when they do not answer the question.
3. **Read** — the reply keeps its passages, so `[2]` and the "N passages" chip open
   `components/citation-pane.tsx`: a resizable second panel that renders the PDF
   with pdf.js (`components/pdf-pane.tsx`) and marks the cited lines.

## Endpoints

| Route | What it does |
| --- | --- |
| `POST /v1/chat/completions` | the chat itself: retrieves, answers, streams `rag.passages` for the reader |
| `POST /api/rag/chat` | the same retrieval and answer without chat storage; `stream: false` returns JSON |
| `GET /api/rag/search?q=` | retrieval only, no model call — for inspecting what the answer would see |
| `GET /api/rag/models` | the chat models the gateway accepts |

## Running it

```bash
npm install
cp .env.example .env      # then fill in the keys below
npm run dev
```

| Variable | Purpose |
| --- | --- |
| `OPENCODE_API_KEY` | opencode go key; every request also sends an `x-opencode-session` header |
| `OPENCODE_BASE_URL` | defaults to `https://opencode.ai/inference/go/openai/v1` |
| `RAG_MODEL` | model id, defaults to `deepseek-v4.1-flash` |
| `ENABLE_WEB_SEARCH` | `1` to let the chat search the web; off by default |
| `ENABLE_MEMORY_RECALL` | `1` to store and recall earlier conversations; off by default |
| `REASONING_EFFORT` | `none` (default) keeps reasoning models from spending tokens thinking |

## Layout

```
app/v1/chat/completions   chat + retrieval + streaming
app/api/rag/*             retrieval-first HTTP API
components/citation-pane  the split and the reader's state
components/pdf-pane       pdf.js page canvases and the passage highlight
lib/rag                   corpus, BM25, prompt, opencode client
lib/rag/corpus.jsonl      317 chunks with paper, section and page
```

`public/pdf.worker.min.mjs` is copied from `node_modules/pdfjs-dist/build/` and has
to be re-copied whenever that package updates.
