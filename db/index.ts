import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const file = process.env.DATABASE_PATH ?? join(process.cwd(), "data", "recall.db");
mkdirSync(dirname(file), { recursive: true });

export const sqlite = new Database(file);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

/** Schema is created here rather than by a migration step so `npm run dev`
 *  works on a fresh clone with nothing to run first. */
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS user (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    emailVerified INTEGER NOT NULL DEFAULT 0,
    image TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS session (
    id TEXT PRIMARY KEY,
    expiresAt INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    ipAddress TEXT,
    userAgent TEXT,
    userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS account (
    id TEXT PRIMARY KEY,
    accountId TEXT NOT NULL,
    providerId TEXT NOT NULL,
    userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    accessToken TEXT,
    refreshToken TEXT,
    idToken TEXT,
    accessTokenExpiresAt INTEGER,
    refreshTokenExpiresAt INTEGER,
    scope TEXT,
    password TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS verification (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expiresAt INTEGER NOT NULL,
    createdAt INTEGER,
    updatedAt INTEGER
  );

  CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    title TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS chats_owner ON chats(owner, updatedAt);

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    chatId TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    reasoning TEXT,
    reasoningMs INTEGER,
    toolCalls TEXT,
    attachments TEXT,
    at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS messages_chat ON messages(chatId, at);

  CREATE TABLE IF NOT EXISTS turns (
    id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    chat TEXT NOT NULL,
    at INTEGER NOT NULL,
    role TEXT NOT NULL,
    text TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS turns_owner_at ON turns(owner, at);

  CREATE VIRTUAL TABLE IF NOT EXISTS turns_fts
    USING fts5(text, turn_id UNINDEXED, tokenize = 'porter');
`);

export const db = drizzle(sqlite, { schema });
