"use client";

/* eslint-disable @next/next/no-img-element -- local previews are blob URLs, not optimizable assets */

import { ArrowUp, Check, ChevronDown, FileText, ImagePlus, Mic, Plus, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useChat } from "@/components/chat-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { PROMPT_ROTATE_MS, PROMPT_SUGGESTIONS } from "@/lib/suggestions";
import { cn } from "@/lib/utils";

const MAX_ATTACHMENTS = 5;
const MAX_BYTES = 10 * 1024 * 1024;

type Attachment = {
  id: string;
  file: File;
  url?: string;
};

/** Clipboard images arrive as "image.png", which makes every pasted shot look alike. */
function rename(file: File) {
  if (file.name && file.name !== "image.png") return file;
  const stamp = new Date().toISOString().slice(11, 19).replaceAll(":", "");
  return new File([file], `pasted-${stamp}.png`, { type: file.type });
}

function extension(name: string) {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "file" : name.slice(dot + 1);
}

export function Composer({ className }: { className?: string }) {
  const { send, stop, streaming, models, model, setModel } = useChat();
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [rejected, setRejected] = useState("");
  const [dragging, setDragging] = useState(false);
  const [closingDrop, setClosingDrop] = useState(false);
  const [leaving, setLeaving] = useState<string[]>([]);
  const [focused, setFocused] = useState(false);
  const [tick, setTick] = useState(0);
  const reduce = useReducedMotion();
  const images = useRef<HTMLInputElement>(null);
  const documents = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const selected = models.find((option) => option.id === model);
  const full = attachments.length >= MAX_ATTACHMENTS;
  const empty = !prompt && attachments.length === 0;

  // The suggestion cycles only while the field is empty and unfocused: motion
  // next to a caret distracts from what is being typed.
  useEffect(() => {
    if (!empty || focused) return;
    const timer = window.setInterval(() => setTick((value) => value + 1), PROMPT_ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [empty, focused]);

  useEffect(() => {
    if (!rejected) return;
    const timer = window.setTimeout(() => setRejected(""), 4000);
    return () => window.clearTimeout(timer);
  }, [rejected]);

  const add = (list: FileList | File[] | null) => {
    if (!list?.length) return;

    const incoming = Array.from(list);
    const accepted = incoming.filter((file) => file.size <= MAX_BYTES).map(rename);
    const oversize = incoming.length - accepted.length;
    setRejected(oversize ? `${oversize} file(s) over 10 MB were skipped` : "");

    setAttachments((previous) =>
      [
        ...previous,
        ...accepted.map((file) => ({
          id: crypto.randomUUID(),
          file,
          url: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
        })),
      ].slice(0, MAX_ATTACHMENTS),
    );
  };

  const remove = (attachment: Attachment) => {
    // Fade the tile out first; the row collapses once it is gone.
    setLeaving((previous) => [...previous, attachment.id]);
    window.setTimeout(() => {
      if (attachment.url) URL.revokeObjectURL(attachment.url);
      setAttachments((previous) => previous.filter((item) => item.id !== attachment.id));
      setLeaving((previous) => previous.filter((id) => id !== attachment.id));
    }, 150);
  };

  const submit = () => {
    if ((!prompt.trim() && attachments.length === 0) || streaming) return;
    void send(prompt, attachments.map((attachment) => attachment.file));
    attachments.forEach((attachment) => attachment.url && URL.revokeObjectURL(attachment.url));
    setAttachments([]);
    setRejected("");
    setPrompt("");
  };

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = Array.from(event.clipboardData.files);
    if (pasted.length === 0 || full) return;
    event.preventDefault();
    add(pasted);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
  };

  const endDrag = () => {
    dragDepth.current = 0;
    setDragging(false);
    setClosingDrop(true);
    window.setTimeout(() => setClosingDrop(false), 120);
  };

  return (
    <div
      className={cn(
        "relative w-full rounded-[20px] bg-card p-2 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_10px_24px_-18px_rgba(0,0,0,0.15)] transition-[background-color,box-shadow] duration-150 ease-out has-focus-visible:ring-2 has-focus-visible:ring-ring/40",
        className,
      )}
      onDragEnter={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={onDragOver}
      onDragLeave={() => {
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) endDrag();
      }}
      onDrop={(event) => {
        event.preventDefault();
        endDrag();
        if (!full) add(event.dataTransfer.files);
      }}
    >
      <input
        ref={images}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          add(event.target.files);
          event.target.value = "";
        }}
      />
      <input
        ref={documents}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          add(event.target.files);
          event.target.value = "";
        }}
      />

      {(dragging || closingDrop) && (
        <div
          className={cn(
            "pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-[20px] border border-dashed border-ring/60 bg-card/85 text-[12px] text-muted-foreground transition-opacity duration-[120ms] ease-out motion-reduce:transition-none",
            dragging ? "opacity-100" : "opacity-0",
          )}
        >
          Drop to attach
        </div>
      )}

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-1 pt-1 pb-2">
          {attachments.map((attachment) => (
            <figure
              key={attachment.id}
              data-reveal-host
              className={cn(
                "enter-pop w-16",
                leaving.includes(attachment.id) && "scale-[0.96] opacity-0",
              )}
            >
              <div className="relative size-16 overflow-hidden rounded-xl border border-border bg-background">
                {attachment.url ? (
                  <img
                    src={attachment.url}
                    alt={attachment.file.name}
                    className="size-full object-cover"
                  />
                ) : (
                  <span className="grid size-full place-items-center text-muted-foreground">
                    <FileText className="size-5" strokeWidth={1.6} />
                  </span>
                )}
                <span className="absolute bottom-1 left-1 rounded bg-card/90 px-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                  {extension(attachment.file.name)}
                </span>
                <button
                  type="button"
                  data-reveal
                  aria-label={`Remove ${attachment.file.name}`}
                  onClick={() => remove(attachment)}
                  className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-black/55 text-white opacity-0 transition-opacity duration-150 after:absolute after:-inset-1 focus-visible:opacity-100"
                >
                  <X className="size-3" strokeWidth={2.2} />
                </button>
              </div>
              <figcaption className="mt-1 truncate text-[11px] text-muted-foreground">
                {attachment.file.name}
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {rejected && (
        <p role="status" className="enter-note px-2 pb-1 text-[11px] text-muted-foreground">
          {rejected}
        </p>
      )}

      <div className="relative">
        <Textarea
          rows={2}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          aria-label="Message"
          className="min-h-[52px] resize-none border-0 bg-transparent px-2 py-1.5 text-[14px] leading-5 shadow-none dark:bg-transparent focus-visible:ring-0"
        />
        {empty && (
          <div className="pointer-events-none absolute top-1.5 right-2 left-2 h-5 overflow-hidden text-[14px] leading-5">
            <AnimatePresence initial={false} mode="sync">
              <motion.span
                key={tick}
                initial={reduce ? { opacity: 0 } : { y: "100%", opacity: 0 }}
                animate={reduce ? { opacity: 1 } : { y: "0%", opacity: 1 }}
                exit={reduce ? { opacity: 0 } : { y: "-100%", opacity: 0 }}
                transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
                className="absolute inset-0 truncate text-muted-foreground/80"
              >
                {PROMPT_SUGGESTIONS[tick % PROMPT_SUGGESTIONS.length]}
              </motion.span>
            </AnimatePresence>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between px-0.5 pb-0.5">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Add attachment"
                className="rounded-full border-border bg-card text-foreground shadow-sm hover:bg-accent"
              />
            }
          >
            <Plus strokeWidth={1.8} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-64">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-[11px]">Attach</DropdownMenuLabel>
              <DropdownMenuItem
                disabled={full}
                className="items-start gap-2.5 py-2 text-[13px]"
                onClick={() => images.current?.click()}
              >
                <ImagePlus className="mt-0.5 size-4 text-muted-foreground" strokeWidth={1.7} />
                <span className="flex flex-col">
                  Photos
                  <span className="text-[11px] text-muted-foreground">PNG, JPG, HEIC</span>
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={full}
                className="items-start gap-2.5 py-2 text-[13px]"
                onClick={() => documents.current?.click()}
              >
                <FileText className="mt-0.5 size-4 text-muted-foreground" strokeWidth={1.7} />
                <span className="flex flex-col">
                  Files
                  <span className="text-[11px] text-muted-foreground">PDF, CSV, ZIP</span>
                </span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <p className="border-t border-border px-1.5 pt-1.5 pb-0.5 text-[11px] text-muted-foreground">
              {full ? "Remove one to add another" : "…or drop and paste them here"}
            </p>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="group h-7 gap-1 px-1.5 text-[12px] font-normal text-muted-foreground hover:bg-accent hover:text-foreground aria-expanded:text-foreground"
                />
              }
            >
              <span className="max-w-[18ch] truncate leading-none" title={selected?.label}>
                {selected?.label ?? "Model"}
              </span>
              <ChevronDown
                className="size-3 text-muted-foreground transition-transform duration-150 ease-out group-aria-expanded:rotate-180"
                strokeWidth={1.8}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-auto min-w-44">
              {models.length === 0 && (
                <DropdownMenuItem disabled className="text-[13px]">
                  No models available
                </DropdownMenuItem>
              )}
              {models.map((option) => (
                <DropdownMenuItem
                  key={option.id}
                  className="gap-2 text-[13px]"
                  onClick={() => setModel(option.id)}
                >
                  <span className="truncate">{option.label}</span>
                  {option.id === model && (
                    <Check className="ml-auto size-3.5 text-muted-foreground" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Voice input"
            className="rounded-full text-foreground hover:bg-accent"
          >
            <Mic strokeWidth={1.7} />
          </Button>
          <Button
            size="icon-sm"
            aria-label={streaming ? "Stop" : "Send"}
            onClick={streaming ? stop : submit}
            disabled={!streaming && !prompt.trim() && attachments.length === 0}
            className="relative rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-foreground/10 disabled:text-foreground/40 disabled:opacity-100"
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={streaming ? "stop" : "send"}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
                className="grid place-items-center"
              >
                {streaming ? (
                  <span className="size-2.5 rounded-[2px] bg-primary-foreground" />
                ) : (
                  <ArrowUp strokeWidth={2} />
                )}
              </motion.span>
            </AnimatePresence>
          </Button>
        </div>
      </div>
    </div>
  );
}
