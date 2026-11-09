import { and, eq } from "drizzle-orm";
import { db, sqlite } from "@/db";
import { turns } from "@/db/schema";

export type Role = "user" | "assistant";
export type StoredTurn = { at: number; role: Role; text: string };
export type ListedTurn = StoredTurn & { id: string; chat: string };

const OWNER_LIMIT = 2000;
const DAY = 24 * 60 * 60 * 1000;

export function rememberTurn(turn: {
  owner: string;
  chat: string;
  role: Role;
  text: string;
  at?: number;
}) {
  const text = turn.text.trim();
  if (!text) return;

  const at = turn.at ?? Date.now();

  // A retried request must not become a second memory of the same sentence.
  const last = db
    .select({ role: turns.role, text: turns.text })
    .from(turns)
    .where(and(eq(turns.owner, turn.owner), eq(turns.chat, turn.chat)))
    .orderBy(turns.at)
    .limit(1)
    .get();

  if (last?.role === turn.role && last.text === text) return;

  const id = crypto.randomUUID();
  db.insert(turns).values({ id, owner: turn.owner, chat: turn.chat, at, role: turn.role, text }).run();
  sqlite.prepare("INSERT INTO turns_fts (text, turn_id) VALUES (?, ?)").run(text, id);

  sqlite
    .prepare(
      `DELETE FROM turns WHERE owner = ? AND id NOT IN (
         SELECT id FROM turns WHERE owner = ? ORDER BY at DESC LIMIT ${OWNER_LIMIT}
       )`,
    )
    .run(turn.owner, turn.owner);
}

export function listTurns(owner: string, limit = 200): ListedTurn[] {
  const rows = db.select().from(turns).where(eq(turns.owner, owner)).all();

  return rows
    .sort((a, b) => a.at - b.at)
    .slice(-limit)
    .map((row) => ({
      id: row.id,
      chat: row.chat,
      at: row.at,
      role: row.role as Role,
      text: row.text.slice(0, 600),
    }));
}

export function recentAsks(owner: string, limit = 5): StoredTurn[] {
  const rows = db
    .select({ at: turns.at, text: turns.text })
    .from(turns)
    .where(and(eq(turns.owner, owner), eq(turns.role, "user")))
    .all();

  return rows
    .sort((a, b) => a.at - b.at)
    .slice(-limit)
    .map((row) => ({ at: row.at, role: "user" as const, text: row.text }));
}

function ftsQuery(query: string) {
  return query
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term}"`)
    .join(" OR ");
}

export function recallTurns(options: {
  owner: string;
  query?: string;
  from?: string;
  to?: string;
  limit?: number;
}): StoredTurn[] {
  const { owner, query, from, to, limit = 8 } = options;

  const fromAt = from ? Date.parse(`${from}T00:00:00Z`) : -Infinity;
  const toAt = to ? Date.parse(`${to}T00:00:00Z`) + DAY : Infinity;

  const terms = query ? ftsQuery(query) : "";

  if (terms) {
    const rows = sqlite
      .prepare(
        `SELECT t.at AS at, t.role AS role, t.text AS text
           FROM turns_fts f
           JOIN turns t ON t.id = f.turn_id
          WHERE turns_fts MATCH ? AND t.owner = ? AND t.at >= ? AND t.at < ?
          ORDER BY t.at DESC
          LIMIT ?`,
      )
      .all(terms, owner, fromAt === -Infinity ? 0 : fromAt, toAt === Infinity ? Number.MAX_SAFE_INTEGER : toAt, limit) as StoredTurn[];

    return rows
      .reverse()
      .map((row) => ({ at: row.at, role: row.role, text: row.text.slice(0, 600) }));
  }

  const rows = db.select().from(turns).where(eq(turns.owner, owner)).all();

  return rows
    .filter((row) => row.at >= fromAt && row.at < toAt)
    .sort((a, b) => a.at - b.at)
    .slice(-limit)
    .map((row) => ({ at: row.at, role: row.role as Role, text: row.text.slice(0, 600) }));
}

function forget(owner: string, where: string, params: (string | number)[]) {
  const ids = sqlite
    .prepare(`SELECT id FROM turns WHERE ${where}`)
    .all(...params) as { id: string }[];

  if (ids.length > 0) {
    sqlite
      .prepare(`DELETE FROM turns_fts WHERE turn_id IN (${ids.map(() => "?").join(", ")})`)
      .run(...ids.map((row) => row.id));
  }

  const result = sqlite.prepare(`DELETE FROM turns WHERE ${where}`).run(...params);
  return Number(result.changes ?? 0);
}

export function forgetTurns(owner: string, ids: string[]) {
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => "?").join(", ");
  return forget(owner, `owner = ? AND id IN (${placeholders})`, [owner, ...ids]);
}

export function clearTurns(owner: string) {
  return forget(owner, "owner = ?", [owner]);
}

export function clearChat(owner: string, chat: string) {
  return forget(owner, "owner = ? AND chat = ?", [owner, chat]);
}
