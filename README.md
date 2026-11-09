<img src="app/icon.svg" width="56" height="56" alt="" align="left" hspace="12" vspace="4" />

# recall

**A chat agent with a dated memory.** Ask once, come back next week, and it starts from what you asked before — searching the web again when a fact could have moved, and showing the sources behind every answer.

**Live at [recall.himanshu.co](https://recall.himanshu.co)** — the agent is at [/chat](https://recall.himanshu.co/chat), and no account is needed to use it.

<br clear="left" />

---

## What it does

- **Memory across chats.** Every turn is stored with a timestamp. A `recall` tool lets the model search that log by keyword and by date range, so "what did I ask on 3 November" is a lookup, not a guess.
- **Search with receipts.** A `web_search` tool asks Tavily, falls back to a self-hosted SearXNG, and filters unrelated pages before they reach the model. Answers end in the sources they used.
- **A readable agent.** Reasoning streams in and folds away into "Thought for 12s", searches appear as a source strip, and replies render as markdown.
- **Accounts or guests.** Guests get a cookie-scoped identity and local chats; signing in with Google moves chats to the server.

## How it works

Each request to `/v1/chat/completions` assembles a prompt from today's date, the last five questions and the current transcript, then runs a small tool loop:

```text
prompt ──▶ model ──▶ tool_calls? ──▶ recall    (dated log, keyword + date range)
                        │         └─▶ web_search (Tavily, then SearXNG)
                        └──▶ stream deltas ──▶ sources strip ──▶ prose
```

A turn may call a tool more than once. When the loop is done the assistant's answer is stored as a memory, which is what makes the next conversation start further along.

## Getting started

Use the hosted instance at **[recall.himanshu.co](https://recall.himanshu.co)**, or run it locally — requires **Node 22+** (better-sqlite3 is native).

```bash
npm install
cp .env.example .env.local   # fill in the keys below
npm run dev
```

Open <http://localhost:3000> for the landing page or <http://localhost:3000/chat> for the agent. The SQLite schema is created on first boot at `data/recall.db`, so there is nothing to migrate.

> [!NOTE]
> The app runs with only a model key. Without `TAVILY_API_KEY` search falls back to SearXNG; without Google credentials the sign-in entry point is inert and everything still works as a guest.

## Configuration

All keys live in `.env.example`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | yes | Key for an OpenAI-compatible provider |
| `OPENAI_BASE_URL` | yes | Base URL, e.g. `https://api.openai.com/v1` |
| `OPENAI_MODEL` | no | Default model when a request omits one |
| `TAVILY_API_KEY` | no | Primary web search |
| `SEARXNG_URL`, `SEARXNG_API_KEY` | no | Fallback search instance |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | for auth | better-auth session signing |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | for auth | Google OAuth |
| `DATABASE_PATH` | no | SQLite file, defaults to `data/recall.db` |

The model picker is limited to the two entries in [`lib/models.ts`](lib/models.ts); anything else is clamped to the default.

## API

The chat endpoint is OpenAI-compatible, so any OpenAI client can talk to it.

| Route | Description |
| --- | --- |
| `POST /v1/chat/completions` | Streaming chat with the tool loop; accepts `stream` |
| `GET /v1/models` | The models the picker offers |
| `POST /v1/chat/title` | Names a conversation from its first message |
| `GET /v1/memory`, `DELETE /v1/memory` | List or clear stored memories |
| `GET /api/chats`, `PUT /api/chats`, `DELETE /api/chats` | Signed-in chat storage |
| `/api/auth/*` | better-auth handlers |

## Project layout

```text
app/
  page.tsx                 landing page
  chat/                    the agent
  v1/                      OpenAI-compatible routes (chat, models, title, memory)
  api/                     auth handlers and signed-in chat storage
components/
  chat-*.tsx               provider, surface, thread
  composer.tsx             prompt box, attachments, model picker
  command-palette.tsx      ⌘K search over every message
  memories.tsx             what was stored, and forgetting it
  ui/                      shadcn components
db/                        drizzle schema and SQLite connection
lib/
  auth.ts, auth-client.ts  better-auth
  memory.ts                turns, recall, forget
  search.ts                Tavily with SearXNG fallback
  models.ts                the model allowlist
```

## Design notes

How the agent loop, the memory model and the storage split were decided — and what is deliberately missing — is written up in [DESIGN.md](DESIGN.md).

## Notes

- **Guest identity** is a year-long `httpOnly` cookie, so memory survives a reload without an account; signing in replaces it with your user id.
- **Storage split.** Guests keep chats in `localStorage`; signed-in users' chats live in SQLite. Guest chats are not imported on sign-in yet.
- **Search is filtered, not trusted.** Results that share no term with the query are dropped, and an answer that could not be verified says so.

Built as a submission for the [minimi](https://minimi.so) software intern challenge.
