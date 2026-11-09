import { integer, sqliteTable, text, index } from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("createdAt").notNull(),
  updatedAt: integer("updatedAt").notNull(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("createdAt").notNull(),
  updatedAt: integer("updatedAt").notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: integer("accessTokenExpiresAt"),
  refreshTokenExpiresAt: integer("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("createdAt").notNull(),
  updatedAt: integer("updatedAt").notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expiresAt").notNull(),
  createdAt: integer("createdAt"),
  updatedAt: integer("updatedAt"),
});

/** One conversation. `owner` is a user id when signed in, else the guest cookie. */
export const chats = sqliteTable(
  "chats",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    title: text("title").notNull(),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("createdAt").notNull(),
    updatedAt: integer("updatedAt").notNull(),
  },
  (table) => [index("chats_owner").on(table.owner, table.updatedAt)],
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    chatId: text("chatId")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    reasoning: text("reasoning"),
    reasoningMs: integer("reasoningMs"),
    toolCalls: text("toolCalls"),
    attachments: text("attachments"),
    at: integer("at").notNull(),
  },
  (table) => [index("messages_chat").on(table.chatId, table.at)],
);

/** The dated log the recall tool searches. */
export const turns = sqliteTable(
  "turns",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    chat: text("chat").notNull(),
    at: integer("at").notNull(),
    role: text("role").notNull(),
    text: text("text").notNull(),
  },
  (table) => [index("turns_owner_at").on(table.owner, table.at)],
);
