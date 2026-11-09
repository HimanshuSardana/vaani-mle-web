import { memoryOwner } from "@/lib/auth";
import { clearChat, clearTurns, forgetTurns, listTurns } from "@/lib/memory";

export async function DELETE(request: Request) {
  const { owner } = await memoryOwner(request);

  const params = new URL(request.url).searchParams;
  const chat = params.get("chat");
  const turns = params.get("turn");

  if (turns) {
    return Response.json({ cleared: forgetTurns(owner, turns.split(",").filter(Boolean)) });
  }

  return Response.json({ cleared: chat ? clearChat(owner, chat) : clearTurns(owner) });
}

export async function GET(request: Request) {
  const { owner, cookie } = await memoryOwner(request);
  const turns = listTurns(owner);

  const response = Response.json({
    turns: turns.map((turn) => ({
      id: turn.id,
      at: turn.at,
      role: turn.role,
      text: turn.text,
      chat: turn.chat,
    })),
  });

  if (cookie) response.headers.append("set-cookie", cookie);
  return response;
}
