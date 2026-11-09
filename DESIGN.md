# Design

recall is a chat agent whose one job is to be right about *when*. This is how it is built, why, and what I would do with more time.

## The problem I designed for

The evaluation asks three shapes of question:

1. **"What did I ask on 3 November?"** — a lookup with an exact key: the date.
2. **"Has any of them changed pricing since?"** — an entity plus a time window, answered by re-checking the world.
3. **"Last Tuesday I asked about Postgres hosting — has anything changed?"** — both at once, starting from memory and ending in search.

None of these are "find something semantically similar". Two are temporal, all three are entity-anchored. That framing decided the architecture: structured retrieval first, search second, and a prompt that always knows today's date.

## The loop

One endpoint does the work — `POST /v1/chat/completions`, OpenAI-compatible, so the UI is just a client and any OpenAI tool could drive it.

```text
system prompt      today's date + the last five questions + the current transcript
      │
      ▼
   model ──tool_calls?──▶ recall       SQL: owner, keyword (FTS5), from/to range
      │                 └▶ web_search   Tavily, then a self-hosted SearXNG
      │
      ▼
  stream deltas ──▶ thinking collapses to "Thought for 12s"
                ──▶ sources strip (domains, and which query found them)
                ──▶ prose
                ──▶ the turn is written to memory
```

A request may round-trip through the model up to three times. If it is still asking to search after that, the tool stays advertised and a nudging user turn ("searching is done; answer now") ends the loop — withholding the tool makes this model emit its raw tool syntax as text, which is worse than one extra round.

## Decisions

| Decision | Alternative | Why |
| --- | --- | --- |
| `recall` as a tool the model calls | Inject retrieved context automatically | The questions are precise ("on 3 November"). A date filter returns exactly those turns; auto-injection spends tokens on near-misses. Tool calls are also visible and explainable. |
| Date + last five asks in the system prompt | Rely on the tool for everything | Most recall needs no round trip at all, which is the difference between a 1s and a 3s answer. The tool is the fallback for anything older or contested. |
| SQLite + FTS5 + range filters | Vector database | See below. |
| Sources as an extra SSE field on the chunk | Custom endpoint, or nothing | Keeps the wire format OpenAI-clean while letting the UI show provenance. Unknown fields are ignored by other clients. |
| Guest cookie, then user id | Accounts only | Memory that dies on reload is not memory. Guests get a year-long `httpOnly` cookie; signing in replaces it with the user id, so one `UPDATE` would migrate a guest's history. |
| Guests keep chats in `localStorage`, signed-in users in SQLite | One store for everyone | Guests leave no conversations on the server. The cost is the import path on sign-in, which is not built yet (see below). |
| Model allowlist in `lib/models.ts` | Proxy whatever the provider offers | Two models the app is tested against, and any other id is clamped to the default so a stale picker value cannot reach an unlisted model. |
| Search results filtered by term overlap | Trust the engine | The fallback instance returns unrelated pages when its engines are blocked. Dropping results that share no term with the query keeps that noise out of the model's context — and an empty result is reported honestly. |

## Rejected: a vector-only memory

The obvious build is embeddings and a similarity search. I did not, because the evaluation is not a similarity problem:

- **"On 3 November"** has no semantic neighbours. Cosine search returns topically close turns from the wrong week; a `WHERE at BETWEEN` returns the right two.
- **"Has pricing changed"** is not retrieval at all. It is a ledger: what was claimed, from where, when — then a re-check.
- **"12 engineers, 5 CRM tools"** is a fact with a shape, not a chunk of text.

So retrieval is relational: filter by owner, optionally by date range, rank by keyword (BM25), and only then order results. A dense re-rank inside that filtered window is a fifteen-line seam I have not needed yet; it starts paying when the log is thousands of turns, and I would reach for `sqlite-vec` in the same file rather than a hosted service. A hosted vector DB for a single-user demo buys a network hop, a key and a cold start for a corpus that fits in memory.

The other half — freshness — is deliberately *not* solved by retrieval. See the gap below.

## Memory, concretely

- `turns` — one row per message, with `owner`, `chat`, `at`. Written after each completed answer, deduped against a retried request, capped at 2,000 turns per owner.
- `recall({ query?, from?, to? })` — FTS5 `MATCH` with the date range applied in SQL; falls back to a plain ordered scan when there is no query. Returns short, dated turns.
- The Memories screen is the human side of the same data: questions with their answers, per-entry *Forget* (`?turn=id,id`) and *Delete all*, both server-side. Deleting a chat removes its transcript **and** that chat's turns, so the agent cannot quote a conversation you threw away.

## Reading and feeling

The interface is one quiet surface: a warm-neutral canvas, a composer with weight, monochrome type. Motion is limited to things that would otherwise teleport — the composer glides between its centred and docked positions with a transform-only FLIP, list rows animate position (never size, so a collapsing rail cannot make them wobble), the thread fades up behind the first answer, and navigation from the landing slides in with a view transition. Reasoning streams, then folds into "Thought for Ns"; a reply can be stopped mid-stream; `⌘K` searches every message you have ever sent. Everything respects `prefers-reduced-motion` by dropping movement and keeping opacity.

## What is not built

- **A claim ledger.** The one thing the "has pricing changed" questions really want: `{ entity, claim, source, observedAt, ttl }`, re-fetched on recall and diffed, so the answer is "was $15 on 3 November, now $20" rather than a fresh search with no memory of what it used to say. Today recall returns turns, and the model compares them itself — which works, but has no TTL and no source-level check.
- **Importing guest chats on sign-in.** The split is deliberate, the merge is missing.
- **Compaction.** Long chats send every turn; a rolling summary would keep them cheap.
- **Tests and evals.** Date arithmetic ("last Tuesday" → range), the FTS query builder and the tool loop are the parts I would cover first.

## With another week

1. **Claims with TTL**, written after a search-backed answer and re-checked on recall — the differentiator, and the honest answer to the third example.
2. **An eval harness** replaying the brief's question shapes against seeded history, scoring date resolution, source correctness and "did it admit uncertainty".
3. **Compaction + guest import**, so a month of conversation neither bloats the prompt nor dies at sign-in.
4. **Deployment**: SQLite is right for one machine; `libsql`/Turso keeps the schema and makes it survive a redeploy.
