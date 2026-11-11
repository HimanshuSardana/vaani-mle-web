export type Role = "user" | "assistant";

export type MessageAttachment = { name: string; type: string; thumbnail?: string };

export type ToolCall = {
  name: string;
  query: string;
  results: number;
  sources?: { title: string; url: string }[];
};

/** A retrieved passage, kept with the reply so its marker can open the paper. */
export type Citation = {
  n: number;
  chunk_id: string;
  paper: string;
  short: string;
  title: string;
  section: string;
  pages: string;
  page: number;
  file: string;
  text: string;
};

export type Message = {
  id: string;
  role: Role;
  content: string;
  attachments?: MessageAttachment[];
  reasoning?: string;
  reasoningMs?: number;
  toolCalls?: ToolCall[];
  citations?: Citation[];
};

export type Chat = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
};

const STORAGE_KEY = "vaani.chats";
const DAY = 24 * 60 * 60 * 1000;

export const newId = () => crypto.randomUUID();

export function sessionId() {
  const key = "vaani.session";
  const existing = localStorage.getItem(key);
  if (existing) return existing;

  const id = crypto.randomUUID();
  localStorage.setItem(key, id);
  return id;
}

export function titleFrom(text: string) {
  const clean = text.trim().replace(/\s+/g, " ");
  if (!clean) return "New chat";
  return clean.length > 48 ? `${clean.slice(0, 48).trimEnd()}…` : clean;
}

export function loadChats(): Chat[] {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

export function saveChats(chats: Chat[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  } catch {
    // Storage can be full or blocked; the session still works in memory.
  }
}

export const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

export function groupChats(chats: Chat[], now: number) {
  const groups: { label: string; chats: Chat[] }[] = [
    { label: "Pinned", chats: [] },
    { label: "Today", chats: [] },
    { label: "Yesterday", chats: [] },
    { label: "Previous week", chats: [] },
    { label: "Earlier", chats: [] },
  ];

  const today = startOfDay(new Date(now));

  for (const chat of [...chats].sort((a, b) => b.updatedAt - a.updatedAt)) {
    if (chat.pinned) groups[0].chats.push(chat);
    else if (chat.updatedAt >= today) groups[1].chats.push(chat);
    else if (chat.updatedAt >= today - DAY) groups[2].chats.push(chat);
    else if (chat.updatedAt >= today - 6 * DAY) groups[3].chats.push(chat);
    else groups[4].chats.push(chat);
  }

  return groups.filter((group) => group.chats.length > 0);
}
