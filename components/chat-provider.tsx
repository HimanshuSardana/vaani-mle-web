"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import {
  type Chat,
  type Citation,
  type Message,
  type ToolCall,
  loadChats,
  newId,
  saveChats,
  sessionId,
  startOfDay,
  titleFrom,
} from "@/lib/chat";

type ModelOption = { id: string; label: string };

type ChatContextValue = {
  chats: Chat[];
  activeChat: Chat | null;
  dayStart: number;
  streaming: boolean;
  enteringChatId: string | null;
  loaded: boolean;
  stop: () => void;
  memoriesOpen: boolean;
  openMemories: () => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  togglePin: (id: string) => void;
  deleteChat: (id: string) => void;
  models: ModelOption[];
  model: string;
  setModel: (id: string) => void;
  startNewChat: () => void;
  openChat: (id: string) => void;
  send: (text: string, files?: File[]) => Promise<void>;
};

const ChatContext = createContext<ChatContextValue | null>(null);

const THUMBNAIL_SIZE = 560;

/** A small JPEG the transcript can keep in localStorage, since the source File cannot survive a reload. */
async function makeThumbnail(file: File) {
  if (!file.type.startsWith("image/")) return undefined;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, THUMBNAIL_SIZE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.65);
  } catch {
    return undefined;
  }
}

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) throw new Error("useChat must be used inside <ChatProvider>");
  return context;
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [dayStart, setDayStart] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [enteringChatId, setEnteringChatId] = useState<string | null>(null);
  const [memoriesOpen, setMemoriesOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { data: session, isPending: sessionLoading } = authClient.useSession();
  const signedIn = Boolean(session?.user);
  const synced = useRef(new Map<string, string>());
  const abortRef = useRef<AbortController | null>(null);
  const [model, setModelState] = useState("");

  const signedInRef = useRef(signedIn);
  signedInRef.current = signedIn;

  useEffect(() => {
    if (sessionLoading) return;
    let live = true;

    if (signedInRef.current) {
      fetch("/api/chats")
        .then((response) => (response.ok ? response.json() : { chats: [] }))
        .then((payload: { chats?: Chat[] }) => {
          if (!live) return;
          setChats(payload.chats ?? []);
          setDayStart(startOfDay(new Date()));
          setLoaded(true);
        })
        .catch(() => {
          if (live) setLoaded(true);
        });
    } else {
      // localStorage is only readable on the client, so the first paint has no
      // history to show. Hydrating the store here is the point of the effect.
      setChats(loadChats());
      setDayStart(startOfDay(new Date()));
      setLoaded(true);
    }

    return () => {
      live = false;
    };
  }, [sessionLoading, signedIn]);

  useEffect(() => {
    let cancelled = false;

    fetch("/v1/models")
      .then((response) => response.json())
      .then((payload: { data?: { id: string; name?: string }[] }) => {
        if (cancelled) return;

        const options = (payload.data ?? []).map((entry) => ({
          id: entry.id,
          label: entry.name ?? entry.id,
        }));
        if (options.length === 0) return;

        const saved = localStorage.getItem("vaani.model");
        setModels(options);
        setModelState(
          options.some((option) => option.id === saved) ? saved! : options[0].id,
        );
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;

    if (!signedIn) {
      const local = setTimeout(() => saveChats(chats), 250);
      return () => clearTimeout(local);
    }

    // Signed in: mirror each changed chat to the server, and drop the ones
    // that left the list.
    const remote = setTimeout(() => {
      for (const chat of chats) {
        const fingerprint = JSON.stringify(chat);
        if (synced.current.get(chat.id) === fingerprint) continue;
        synced.current.set(chat.id, fingerprint);
        fetch("/api/chats", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat }),
        }).catch(() => {});
      }

      for (const id of [...synced.current.keys()]) {
        if (chats.some((chat) => chat.id === id)) continue;
        synced.current.delete(id);
        fetch(`/api/chats?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
      }
    }, 500);

    return () => clearTimeout(remote);
  }, [chats, loaded, signedIn]);

  const value = useMemo<ChatContextValue>(() => {
    const activeChat = chats.find((chat) => chat.id === activeId) ?? null;

    const patchAssistant = (
      chatId: string,
      messageId: string,
      patch: Partial<Pick<Message, "content" | "reasoning" | "reasoningMs" | "toolCalls" | "citations">>,
    ) =>
      setChats((previous) =>
        previous.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                messages: chat.messages.map((message) =>
                  message.id === messageId ? { ...message, ...patch } : message,
                ),
              }
            : chat,
        ),
      );

    const appendToAssistant = (chatId: string, messageId: string, content: string) =>
      patchAssistant(chatId, messageId, { content });

    const send = async (text: string, files: File[] = []) => {
      const prompt = text.trim();
      if ((!prompt && files.length === 0) || streaming) return;

      const attachments = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          type: file.type,
          thumbnail: await makeThumbnail(file),
        })),
      );
      const names = files.map((file) => file.name);
      const content = prompt;

      const now = Date.now();
      const userMessage: Message = {
        id: newId(),
        role: "user",
        content,
        ...(attachments.length ? { attachments } : {}),
      };
      const existing = activeChat;
      const chatId = existing?.id ?? newId();

      const nextChats = existing
        ? chats.map((chat) =>
            chat.id === chatId
              ? {
                  ...chat,
                  messages: [...chat.messages, userMessage],
                  updatedAt: now,
                  title: chat.messages.length ? chat.title : titleFrom(content || names[0] || ""),
                }
              : chat,
          )
        : [
            {
              id: chatId,
              title: titleFrom(content || names[0] || "New chat"),
              messages: [userMessage],
              createdAt: now,
              updatedAt: now,
            },
            ...chats,
          ];

      const history = (existing?.messages ?? [])
        .filter((message) => message.content)
        .map(({ role, content: previous }) => ({ role, content: previous }));

      setChats(nextChats);
      setActiveId(chatId);
      setStreaming(true);

      if (!existing) {
        setEnteringChatId(chatId);
        window.setTimeout(
          () => setEnteringChatId((current) => (current === chatId ? null : current)),
          400,
        );
      }

      if (!existing) {
        // Named from the first message while the reply streams; the provisional
        // title is already showing, so this only sharpens it.
        void fetch("/v1/chat/title", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: prompt || `Files: ${names.join(", ")}` }),
        })
          .then((response) => (response.ok ? response.json() : null))
          .then((payload: { title?: string } | null) => {
            const title = payload?.title?.trim();
            if (!title) return;
            setChats((previous) =>
              previous.map((chat) => (chat.id === chatId ? { ...chat, title } : chat)),
            );
          })
          .catch(() => {});
      }

      const assistantId = newId();
      setChats((previous) =>
        previous.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                messages: [
                  ...chat.messages,
                  { id: assistantId, role: "assistant" as const, content: "" },
                ],
              }
            : chat,
        ),
      );

      let thinkingSince: number | null = null;

      try {
        const imageParts = await Promise.all(
          files
            .filter((file) => file.type.startsWith("image/"))
            .map(async (file) => ({
              type: "image_url" as const,
              image_url: { url: await readAsDataUrl(file) },
            })),
        );

        const requestText = names.length
          ? [prompt, `Attached: ${names.join(", ")}`].filter(Boolean).join("\n\n")
          : prompt;

        const controller = new AbortController();
        abortRef.current = controller;

        const response = await fetch("/v1/chat/completions", {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: model || undefined,
            session_id: sessionId(),
            chat_id: chatId,
            stream: true,
            messages: [
              ...history,
              {
                role: "user",
                content: imageParts.length
                  ? [...(requestText ? [{ type: "text", text: requestText }] : []), ...imageParts]
                  : requestText,
              },
            ],
          }),
        });

        if (!response.ok || !response.body) {
          throw new Error(`The assistant responded with ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let reply = "";
        let reasoning = "";
        const toolCalls: ToolCall[] = [];

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";

          for (const event of events) {
            const line = event.trim();
            if (!line.startsWith("data:")) continue;

            const payload = line.slice(5).trim();
            if (payload === "[DONE]") continue;

            const chunk = JSON.parse(payload);

            const reasoningDelta = chunk.choices?.[0]?.delta?.reasoning_content;
            if (typeof reasoningDelta === "string" && reasoningDelta) {
              reasoning += reasoningDelta;
              thinkingSince ??= Date.now();
              patchAssistant(chatId, assistantId, {
                reasoning: reasoning.slice(-4000),
                reasoningMs: Date.now() - thinkingSince,
              });
            }

            const passages = chunk.rag?.passages as Citation[] | undefined;
            if (passages?.length) {
              patchAssistant(chatId, assistantId, { citations: passages });
            }

            const tool = chunk.kraken?.tool as ToolCall | undefined;
            if (tool) {
              toolCalls.push(tool);
              patchAssistant(chatId, assistantId, { toolCalls: [...toolCalls] });
            }

            const delta = chunk.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta) {
              reply += delta;
              patchAssistant(chatId, assistantId, { content: reply });
            }
          }
        }

        setChats((previous) =>
          previous.map((chat) =>
            chat.id === chatId ? { ...chat, updatedAt: Date.now() } : chat,
          ),
        );
      } catch (error) {
        if (abortRef.current?.signal.aborted) return;
        appendToAssistant(
          chatId,
          assistantId,
          error instanceof Error ? error.message : "Something went wrong.",
        );
      } finally {
        if (thinkingSince !== null) {
          patchAssistant(chatId, assistantId, { reasoningMs: Date.now() - thinkingSince });
        }
        abortRef.current = null;
        setStreaming(false);
      }
    };

    return {
      chats,
      activeChat,
      dayStart,
      streaming,
      enteringChatId,
      loaded,
      memoriesOpen,
      openMemories: () => setMemoriesOpen(true),
      searchOpen,
      setSearchOpen,
      togglePin: (id: string) =>
        setChats((previous) =>
          previous.map((chat) => (chat.id === id ? { ...chat, pinned: !chat.pinned } : chat)),
        ),
      deleteChat: (id: string) => {
        setChats((previous) => previous.filter((chat) => chat.id !== id));
        setActiveId((current) => (current === id ? null : current));
        // The transcript goes with it; the server drops that chat's turns so
        // recall cannot quote a conversation the user has thrown away.
        fetch(`/v1/memory?chat=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
      },
      stop: () => abortRef.current?.abort(),
      models,
      model,
      setModel: (id: string) => {
        setModelState(id);
        localStorage.setItem("vaani.model", id);
      },
      startNewChat: () => {
        setMemoriesOpen(false);
        setSearchOpen(false);
        setActiveId(null);
      },
      openChat: (id: string) => {
        setMemoriesOpen(false);
        setSearchOpen(false);
        setActiveId(id);
      },
      send,
    };
  }, [chats, activeId, dayStart, streaming, enteringChatId, loaded, memoriesOpen, searchOpen, models, model]);

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
