"use client";

/* eslint-disable @next/next/no-img-element -- stored thumbnails are data URLs, not optimizable assets */

import { ChevronDown, ChevronRight, FileText } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Mark } from "@/components/mark";
import { CiteScope, CitationChip } from "@/components/citation-pane";
import { Markdown } from "@/components/markdown";
import type { Message, MessageAttachment, ToolCall } from "@/lib/chat";

function UserAttachments({ attachments }: { attachments: MessageAttachment[] }) {
  const images = attachments.filter((attachment) => attachment.thumbnail);
  const files = attachments.filter((attachment) => !attachment.thumbnail);

  return (
    <div className="flex w-full flex-col gap-1.5">
      {images.length > 0 && (
        <div className={images.length > 1 ? "grid grid-cols-2 gap-1.5" : undefined}>
          {images.map((attachment, index) => (
            <img
              key={`${attachment.name}-${index}`}
              src={attachment.thumbnail}
              alt={attachment.name}
              title={attachment.name}
              className={
                images.length > 1
                  ? "aspect-square w-full rounded-lg object-cover"
                  : "max-h-52 w-full rounded-lg object-cover"
              }
            />
          ))}
        </div>
      )}

      {files.length > 0 && (
        <div className="flex flex-wrap items-start gap-1.5">
          {files.map((attachment, index) => (
            <span
              key={`${attachment.name}-${index}`}
              className="inline-flex max-w-[240px] items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground"
            >
              <FileText className="size-3.5 shrink-0" strokeWidth={1.7} />
              <span className="truncate">{attachment.name}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const domainOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

function ToolSources({ calls }: { calls: ToolCall[] }) {
  const [open, setOpen] = useState(false);

  const searches = calls.filter((call) => call.name === "web_search");
  const recalled = calls
    .filter((call) => call.name === "recall")
    .reduce((total, call) => total + call.results, 0);

  const sources = searches
    .flatMap((call) =>
      (call.sources ?? []).map((source) => ({ ...source, query: call.query })),
    )
    .filter(
      (source, index, all) => all.findIndex((other) => other.url === source.url) === index,
    );

  const searched = searches.length;
  const empty = searches.filter((call) => call.results === 0).length;
  const recalledLine =
    recalled > 0 ? `Recalled ${recalled} earlier ${recalled === 1 ? "turn" : "turns"}` : null;

  if (searched === 0) {
    return recalledLine ? (
      <p className="mt-2 text-[11.5px] text-muted-foreground/80">{recalledLine}</p>
    ) : null;
  }

  if (sources.length === 0) {
    return (
      <p className="mt-2 text-[11.5px] text-muted-foreground/80">
        {recalledLine ? `${recalledLine} · ` : ""}
        searched the web {searched === 1 ? "once" : `${searched} times`} · no usable results
      </p>
    );
  }

  return (
    <motion.div
      className="mt-3"
      initial={{ opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
    >
      <div className="flex flex-wrap items-center gap-2">
        {recalledLine ? (
          <span className="text-[11.5px] text-muted-foreground/80">{recalledLine}</span>
        ) : null}
        <div className="flex -space-x-1.5">
          {sources.slice(0, 5).map((source) => (
            <span
              key={source.url}
              title={`${source.title} — ${domainOf(source.url)}`}
              className="grid size-5 place-items-center rounded-full border border-card bg-muted text-[9px] font-medium text-muted-foreground uppercase"
            >
              {domainOf(source.url)[0] ?? "•"}
            </span>
          ))}
        </div>

        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground transition-colors duration-150 hover:text-foreground"
        >
          {sources.length} {sources.length === 1 ? "source" : "sources"} from {searched}{" "}
          {searched === 1 ? "search" : "searches"}
          <ChevronDown
            className={
              open
                ? "size-3 rotate-180 transition-transform duration-150 ease-out"
                : "size-3 transition-transform duration-150 ease-out"
            }
            strokeWidth={2}
          />
        </button>
      </div>

      {open && (
        <div className="enter-pop mt-2 border-t border-border pt-2">
          <ul className="flex flex-col gap-2">
            {sources.map((source) => (
              <li key={source.url} className="flex items-start gap-2">
                <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded bg-muted text-[8px] font-medium text-muted-foreground uppercase">
                  {domainOf(source.url)[0] ?? "•"}
                </span>
                <div className="min-w-0">
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-[12px] underline underline-offset-2 hover:text-muted-foreground"
                  >
                    {source.title || domainOf(source.url)}
                  </a>
                  <p className="text-[10.5px] text-muted-foreground/70">
                    {domainOf(source.url)} · from “{source.query}”
                  </p>
                </div>
              </li>
            ))}
          </ul>

          {empty > 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground/70">
              {empty} {empty === 1 ? "search" : "searches"} returned nothing
            </p>
          )}
        </div>
      )}
    </motion.div>
  );
}

function Reasoning({ text, live, ms }: { text: string; live: boolean; ms?: number }) {
  const seconds = ms ? Math.max(1, Math.round(ms / 1000)) : null;
  const label = live ? "Thinking" : seconds ? `Thought for ${seconds}s` : "Thought";

  return (
    <details className="group mb-2">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[11.5px] text-muted-foreground select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="size-3 transition-transform duration-150 ease-out group-open:rotate-90"
          strokeWidth={2}
        />
        {label}
      </summary>
      <p className="mt-1.5 border-l-2 border-border pl-2.5 text-[12.5px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
        {text}
      </p>
    </details>
  );
}

/** Retrieval can hand back more passages than the answer leans on; only the
 *  ones it actually marks belong in the source list. */
function cited(message: Message) {
  const citations = message.citations ?? [];
  if (!message.content) return citations;
  return citations.filter((citation) =>
    new RegExp(`\\[${citation.n}\\]`).test(message.content),
  );
}

function AssistantMark() {
  return (
    <Mark className="mt-1 size-4 shrink-0 text-foreground" />
  );
}

export function ChatThread({
  messages,
  streaming,
  entering = false,
}: {
  messages: Message[];
  streaming: boolean;
  entering?: boolean;
}) {
  const end = useRef<HTMLDivElement>(null);
  const last = messages.at(-1);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length, last?.content]);

  return (
    <section
      role="log"
      aria-live="polite"
      aria-relevant="additions text"
      aria-busy={streaming}
      className={[
        "min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:var(--border)_transparent] [scrollbar-gutter:stable_both-edges]",
        entering ? "enter-thread" : "",
      ].join(" ")}
    >
      <div className="mx-auto w-full max-w-[720px] space-y-6 py-8">
        {messages.map((message) =>
          message.role === "user" ? (
            <div key={message.id} className="flex justify-end">
              <div
                className={
                  message.attachments?.length
                    ? "flex w-fit max-w-[80%] flex-col gap-2 rounded-2xl bg-card p-1.5 text-[14px] leading-relaxed text-foreground shadow-sm"
                    : "max-w-[80%] rounded-2xl bg-card px-4 py-2.5 text-[14px] leading-relaxed text-foreground shadow-sm"
                }
              >
                {message.attachments?.length ? (
                  <UserAttachments attachments={message.attachments} />
                ) : null}
                {message.content && (
                  <p
                    className={
                      message.attachments?.length
                        ? "px-2.5 pb-1 whitespace-pre-wrap"
                        : "whitespace-pre-wrap"
                    }
                  >
                    {message.content}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div key={message.id} className="flex gap-3">
              <AssistantMark />
              <div className="min-w-0 flex-1 pt-0.5">
                {message.reasoning ? (
                  <Reasoning
                    text={message.reasoning}
                    live={streaming && message.id === last?.id && !message.content}
                    ms={message.reasoningMs}
                  />
                ) : null}

                {message.content ? (
                  <CiteScope citations={cited(message)}>
                    <Markdown streaming={streaming && message.id === last?.id}>
                      {message.content}
                    </Markdown>
                  </CiteScope>
                ) : (
                  streaming &&
                  message.id === last?.id && (
                    <span className="caret-block" aria-hidden="true" />
                  )
                )}

                {cited(message).length ? (
                  <CitationChip citations={cited(message)} />
                ) : null}

                {message.toolCalls?.length ? <ToolSources calls={message.toolCalls} /> : null}
              </div>
            </div>
          ),
        )}
        <div ref={end} />
      </div>
    </section>
  );
}
