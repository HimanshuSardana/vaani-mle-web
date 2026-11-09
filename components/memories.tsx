"use client";

import { Trash2, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";

type StoredTurn = {
  id: string;
  at: number;
  role: "user" | "assistant";
  text: string;
  chat: string;
};

type Entry = { id: string; ids: string[]; at: number; question: string; answer?: string };

const DAY = 24 * 60 * 60 * 1000;

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** Answers arrive as markdown; the timeline shows one plain line of them. */
function plain(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#>|]/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stamp(at: number, today: number) {
  const time = new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (at >= today) return `Today · ${time}`;
  if (at >= today - DAY) return `Yesterday · ${time}`;

  const date = new Date(at).toLocaleDateString("en-US", { day: "numeric", month: "short" });
  return `${date} · ${time}`;
}

function buildEntries(turns: StoredTurn[]): Entry[] {
  const entries: Entry[] = [];

  for (const turn of turns) {
    if (turn.role === "user") {
      entries.push({
        id: turn.id,
        ids: [turn.id],
        at: turn.at,
        question: turn.text,
      });
      continue;
    }

    const previous = entries.at(-1);
    if (previous && !previous.answer) {
      previous.answer = plain(turn.text).slice(0, 200);
      previous.ids.push(turn.id);
    }
  }

  return entries.reverse();
}

export function Memories() {
  const [turns, setTurns] = useState<StoredTurn[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [today] = useState(() => startOfDay(new Date()));

  useEffect(() => {
    const controller = new AbortController();

    fetch("/v1/memory", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : { turns: [] }))
      .then((payload: { turns?: StoredTurn[] }) => setTurns(payload.turns ?? []))
      .catch(() => {
        if (!controller.signal.aborted) setTurns([]);
      });

    return () => controller.abort();
  }, []);

  const entries = turns ? buildEntries(turns) : [];

  const forget = (entry: Entry) => {
    setTurns((previous) =>
      (previous ?? []).filter((turn) => !entry.ids.includes(turn.id)),
    );
    fetch(`/v1/memory?turn=${entry.ids.join(",")}`, { method: "DELETE" }).catch(() => {});
  };

  const clearAll = async () => {
    setClearing(true);
    try {
      await fetch("/v1/memory", { method: "DELETE" });
      setTurns([]);
    } finally {
      setClearing(false);
      setConfirming(false);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:var(--border)_transparent] [scrollbar-gutter:stable_both-edges]">
      <div className="mx-auto w-full max-w-[720px] py-10">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[19px] font-medium text-foreground">Memories</h1>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              Everything you asked, newest first. The agent reads back through here.
            </p>
          </div>

          {entries.length > 0 &&
            (confirming ? (
              <div className="enter-pop flex shrink-0 items-center gap-1.5 pt-0.5">
                <span className="text-[11.5px] whitespace-nowrap text-muted-foreground">
                  Delete all {entries.length}?
                </span>
                <button
                  type="button"
                  disabled={clearing}
                  onClick={clearAll}
                  className="inline-flex h-6 items-center gap-1 rounded-full bg-destructive/10 px-2.5 text-[11.5px] font-medium text-destructive transition-colors duration-150 hover:bg-destructive/15 disabled:opacity-60"
                >
                  <Trash2 className="size-3" strokeWidth={2} />
                  {clearing ? "Deleting…" : "Delete"}
                </button>
                <button
                  type="button"
                  disabled={clearing}
                  onClick={() => setConfirming(false)}
                  className="h-6 rounded-full px-2 text-[11.5px] text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[11.5px] text-muted-foreground transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-3" strokeWidth={2} />
                Delete all
              </button>
            ))}
        </header>

        {turns === null && <p className="mt-8 text-[12.5px] text-muted-foreground">Loading…</p>}

        {turns !== null && entries.length === 0 && (
          <p className="mt-8 text-[12.5px] text-muted-foreground">
            Nothing stored yet. Ask something and it will show up here.
          </p>
        )}

        {entries.length > 0 && (
          <ol className="mt-7 border-l border-border pl-5">
            {entries.map((entry) => (
              <motion.li
                key={entry.id}
                data-reveal-host
                layout="position"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ type: "spring", duration: 0.32, bounce: 0.14 }}
                className="relative pb-6 last:pb-0"
              >
                <span className="absolute top-[7px] -left-[23px] size-1.5 rounded-full bg-border" />

                <p className="text-[11px] text-muted-foreground/70">{stamp(entry.at, today)}</p>
                <p className="mt-0.5 text-[13px] text-muted-foreground">{entry.question}</p>
                {entry.answer && (
                  <p className="mt-1 text-[14px] leading-relaxed text-foreground">{entry.answer}</p>
                )}

                <motion.button
                  whileTap={{ scale: 0.94 }}
                  type="button"
                  data-reveal
                  aria-label={`Forget ${entry.question}`}
                  onClick={() => forget(entry)}
                  className="absolute top-0 right-0 inline-flex h-5 items-center gap-1 rounded-full px-1.5 text-[11px] text-muted-foreground/60 opacity-0 transition-[opacity,color] duration-150 hover:text-destructive focus-visible:opacity-100"
                >
                  <X className="size-3" strokeWidth={2} />
                  Forget
                </motion.button>
              </motion.li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
