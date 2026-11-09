"use client";

import { Command } from "cmdk";
import { AnimatePresence, motion } from "motion/react";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useChat } from "@/components/chat-provider";

const MIN_QUERY = 3;
const WINDOW = 150;
const LEAD = 24;
const MAX_RESULTS = 20;

type Entry = { key: string; chatId: string; text: string; lower: string };

function buildIndex(chats: { id: string; messages: { id: string; content: string }[] }[]) {
  const entries: Entry[] = [];

  for (const chat of chats) {
    for (const message of chat.messages) {
      const text = message.content.replace(/\s+/g, " ").trim();
      if (!text) continue;
      entries.push({
        key: `${chat.id}-${message.id}`,
        chatId: chat.id,
        text,
        lower: text.toLowerCase(),
      });
    }
  }

  return entries;
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** One line, with the match brought into view: text before it is trimmed and
 *  marked with a leading ellipsis, the rest is left for CSS to truncate. */
function excerpt(content: string, query: string) {
  const text = content.replace(/\s+/g, " ").trim();
  const at = text.toLowerCase().indexOf(query.toLowerCase());

  if (at <= LEAD) return text.slice(0, WINDOW);

  const from = at - LEAD;
  return `…${text.slice(from, from + WINDOW)}`;
}

function Highlight({ text, query }: { text: string; query: string }) {
  const parts = text.split(new RegExp(`(${escape(query)})`, "ig"));

  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark
            key={index}
            className="rounded-[3px] bg-foreground/[0.14] px-0.5 text-foreground"
          >
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}

export function CommandPalette() {
  const { searchOpen, setSearchOpen } = useChat();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(!searchOpen);
        return;
      }

      if (event.key === "Escape" && searchOpen) {
        event.preventDefault();
        setSearchOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [searchOpen, setSearchOpen]);

  return (
    <AnimatePresence>
      {searchOpen && <Palette key="palette" />}
    </AnimatePresence>
  );
}

function Palette() {
  const { chats, openChat, setSearchOpen } = useChat();
  const [query, setQuery] = useState("");

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Lowercasing every message on each keystroke is what made typing crawl;
  // the index is built once per chats snapshot and searched as plain strings.
  const entries = useMemo(() => buildIndex(chats), [chats]);
  const needle = query.trim().toLowerCase();
  const ready = needle.length >= MIN_QUERY;

  const results = useMemo(() => {
    if (!ready) return [];

    const hits: { entry: Entry; at: number }[] = [];

    for (const entry of entries) {
      const at = entry.lower.indexOf(needle);
      if (at !== -1) hits.push({ entry, at });
    }

    return hits.sort((a, b) => a.at - b.at).slice(0, MAX_RESULTS);
  }, [entries, needle, ready]);

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-black/40"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={() => setSearchOpen(false)}
      role="presentation"
    >
      <motion.div
        className="mx-auto mt-[12vh] w-[min(92vw,560px)] overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-[0_16px_48px_-12px_rgba(0,0,0,0.3)] ring-1 ring-foreground/10"
        initial={{ opacity: 0, y: 4, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.99 }}
        transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
        onClick={(event) => event.stopPropagation()}
      >
        <Command label="Search messages" shouldFilter={false} loop>
          <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
            <Search className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={2} />
            <Command.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Search your messages…"
              className="w-full bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
            />
            <kbd className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              ⌘K
            </kbd>
          </div>

          <Command.List className="max-h-[52vh] overflow-y-auto p-1.5 [scrollbar-width:thin]">
            {ready && (
              <Command.Empty className="px-3 py-8 text-center text-[12.5px] text-muted-foreground">
                No message matches “{query.trim()}”.
              </Command.Empty>
            )}

            {ready &&
              results.map(({ entry }) => (
                <Command.Item
                  key={entry.key}
                  value={entry.key}
                  onSelect={() => openChat(entry.chatId)}
                  className="cursor-pointer truncate rounded-lg px-2 py-1.5 text-[13px] leading-relaxed text-muted-foreground outline-none data-[selected=true]:bg-accent data-[selected=true]:text-foreground"
                >
                  <Highlight text={excerpt(entry.text, query.trim())} query={query.trim()} />
                </Command.Item>
              ))}
          </Command.List>
        </Command>
      </motion.div>
    </motion.div>
  );
}
