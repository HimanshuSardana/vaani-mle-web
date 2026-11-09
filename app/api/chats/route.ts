import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { chats, messages } from "@/db/schema";
import { sessionUser } from "@/lib/auth";

type Incoming = {
  id: string;
  title: string;
  pinned?: boolean;
  createdAt: number;
  updatedAt: number;
  messages: {
    id: string;
    role: string;
    content: string;
    reasoning?: string;
    reasoningMs?: number;
    toolCalls?: unknown;
    attachments?: unknown;
  }[];
};

const json = (value: unknown) => (value === undefined ? null : JSON.stringify(value));
const parse = <T>(value: string | null): T | undefined =>
  value === null ? undefined : (JSON.parse(value) as T);

export async function GET(request: Request) {
  const user = await sessionUser(request);
  if (!user) return Response.json({ chats: [] }, { status: 401 });

  const rows = db.select().from(chats).where(eq(chats.owner, user.id)).all();
  if (rows.length === 0) return Response.json({ chats: [] });

  const bodies = db
    .select()
    .from(messages)
    .where(inArray(messages.chatId, rows.map((row) => row.id)))
    .all();

  return Response.json({
    chats: rows
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((row) => ({
        id: row.id,
        title: row.title,
        pinned: row.pinned,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        messages: bodies
          .filter((body) => body.chatId === row.id)
          .sort((a, b) => a.at - b.at)
          .map((body) => ({
            id: body.id,
            role: body.role,
            content: body.content,
            reasoning: body.reasoning ?? undefined,
            reasoningMs: body.reasoningMs ?? undefined,
            toolCalls: parse(body.toolCalls),
            attachments: parse(body.attachments),
          })),
      })),
  });
}

export async function PUT(request: Request) {
  const user = await sessionUser(request);
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const { chat } = (await request.json()) as { chat?: Incoming };
  if (!chat?.id) return Response.json({ error: "A chat is required" }, { status: 400 });

  const existing = db.select().from(chats).where(eq(chats.id, chat.id)).limit(1).all();
  if (existing[0] && existing[0].owner !== user.id) {
    return Response.json({ error: "That chat belongs to someone else" }, { status: 409 });
  }

  db.insert(chats)
    .values({
      id: chat.id,
      owner: user.id,
      title: chat.title,
      pinned: Boolean(chat.pinned),
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
    })
    .onConflictDoUpdate({
      target: chats.id,
      set: {
        title: chat.title,
        pinned: Boolean(chat.pinned),
        updatedAt: chat.updatedAt,
      },
    })
    .run();

  db.delete(messages).where(eq(messages.chatId, chat.id)).run();

  if (chat.messages.length > 0) {
    db.insert(messages).values(
      chat.messages.map((message, index) => ({
        id: message.id,
        chatId: chat.id,
        role: message.role,
        content: message.content,
        reasoning: message.reasoning ?? null,
        reasoningMs: message.reasoningMs ?? null,
        toolCalls: json(message.toolCalls),
        attachments: json(message.attachments),
        at: index,
      })),
    ).run();
  }

  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await sessionUser(request);
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "An id is required" }, { status: 400 });

  db.delete(chats).where(and(eq(chats.id, id), eq(chats.owner, user.id))).run();
  return Response.json({ ok: true });
}
