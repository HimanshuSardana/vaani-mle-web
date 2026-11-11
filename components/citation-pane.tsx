"use client";

import { ArrowUpRight, ChevronLeft, ChevronRight, FileText, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { PdfPane } from "@/components/pdf-pane";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import type { Citation } from "@/lib/chat";
import { cn } from "@/lib/utils";

/** The reply on screen decides which passages the pane can page through. */
const Scope = createContext<Citation[] | null>(null);

export function CiteScope({ citations, children }: { citations?: Citation[]; children: ReactNode }) {
  return <Scope.Provider value={citations ?? null}>{children}</Scope.Provider>;
}

const Pane = createContext<{
  open: (citations: Citation[], at: number) => void;
  close: () => void;
  isOpen: boolean;
} | null>(null);

export function useCitationPane() {
  const context = useContext(Pane);
  if (!context) {
    return {
      open: () => undefined,
      close: () => undefined,
      isOpen: false,
    };
  }
  return context;
}

const WIDE = "(min-width: 1024px)";

function useWide() {
  const subscribe = useCallback((onChange: () => void) => {
    const query = window.matchMedia(WIDE);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(WIDE).matches,
    () => true,
  );
}

/** A numbered marker in the reply. Markers that do not resolve to a passage in
 *  this reply stay plain text — the model cites other papers too. */
export function CitationLink({ n }: { n: number }) {
  const citations = useContext(Scope);
  const { open } = useCitationPane();
  const citation = citations?.find((item) => item.n === n);

  if (!citation || !citations) return <>[{n}]</>;

  const at = Math.max(0, citations.findIndex((item) => item.n === n));

  return (
    <button
      type="button"
      onClick={() => open(citations, at)}
      title={`${citation.short} · ${citation.section} · p.${citation.pages}`}
      className="mx-0.5 align-super font-mono text-[10.5px] text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground focus-visible:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/40"
    >
      [{n}]
    </button>
  );
}

/** The reply's doorway: one chip instead of one per fact. */
export function CitationChip({ citations }: { citations: Citation[] }) {
  const { open } = useCitationPane();

  if (!citations.length) return null;

  return (
    <button
      type="button"
      onClick={() => open(citations, 0)}
      className="mt-2 inline-flex h-6 items-center gap-1.5 rounded-full border border-border px-2.5 text-[11px] text-muted-foreground transition-colors duration-150 ease-out hover:bg-accent hover:text-foreground"
    >
      <FileText className="size-3" strokeWidth={1.8} />
      {citations.length} {citations.length === 1 ? "passage" : "passages"}
    </button>
  );
}

function PaneHeader({
  citation,
  position,
  onPrev,
  onNext,
  onClose,
}: {
  citation: Citation;
  position: { at: number; count: number };
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const many = position.count > 1;

  return (
    <header className="flex shrink-0 items-center gap-2 px-3 py-2">
      <span className="shrink-0 text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">
        {citation.short}
      </span>
      <span className="truncate text-[11.5px] text-foreground/80">{citation.section}</span>
      <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
        {many ? `${position.at + 1}/${position.count} · ` : ""}p.{citation.pages}
      </span>

      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        {many && (
          <>
            <button
              type="button"
              onClick={onPrev}
              aria-label="Previous passage"
              className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors duration-150 ease-out hover:bg-accent hover:text-foreground"
            >
              <ChevronLeft className="size-4" strokeWidth={1.8} />
            </button>
            <button
              type="button"
              onClick={onNext}
              aria-label="Next passage"
              className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors duration-150 ease-out hover:bg-accent hover:text-foreground"
            >
              <ChevronRight className="size-4" strokeWidth={1.8} />
            </button>
          </>
        )}
        <a
          href={`${citation.file}#page=${citation.page}`}
          target="_blank"
          rel="noreferrer"
          aria-label="Open the PDF in a new tab"
          className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors duration-150 ease-out hover:bg-accent hover:text-foreground"
        >
          <ArrowUpRight className="size-3.5" strokeWidth={2} />
        </a>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the paper"
          className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors duration-150 ease-out hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/40"
        >
          <X className="size-4" strokeWidth={1.8} />
        </button>
      </div>
    </header>
  );
}

/** The curved light surface each column sits on. */
function Inset({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("overflow-hidden bg-background md:rounded-xl md:shadow-sm", className)}>
      {children}
    </div>
  );
}

/** Holds the pane's state and renders the chat column beside it. The reader is a
 *  sibling inset, so it takes width from the chat instead of covering it. */
const PANE_SIZE = 66;
/** Applied only while the reader is opening or closing, never during a drag. */
const GROW =
  "group-data-[growing]:transition-[flex-grow] group-data-[growing]:duration-300 group-data-[growing]:ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:group-data-[growing]:duration-100";
const GROW_MS = 300;
const SHRINK_MS = 220;

export function CitationSplit({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ list: Citation[]; at: number } | null>(null);
  // Kept for the length of the close animation, so the pane does not empty out
  // while it is still shrinking.
  const [closing, setClosing] = useState<{ list: Citation[]; at: number } | null>(null);
  const [growing, setGrowing] = useState(false);
  const panePanel = useRef<ImperativePanelHandle>(null);
  const lastSize = useRef(PANE_SIZE);
  const timers = useRef<number[]>([]);

  const wide = useWide();
  const open = state !== null;
  const visible = state ?? closing;
  const citation = visible?.list[visible.at] ?? null;

  const close = useCallback(() => {
    setState((current) => {
      if (current) setClosing(current);
      return null;
    });
    timers.current.push(window.setTimeout(() => setClosing(null), SHRINK_MS));
  }, []);

  useEffect(
    () => () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
    },
    [],
  );

  // The panel's width is the animation: growing it moves the chat column over
  // without remounting anything inside it.
  useEffect(() => {
    const panel = panePanel.current;
    if (!panel || !wide) return;

    if (!open) {
      const size = panel.getSize();
      if (size > 0) lastSize.current = size;
    }

    setGrowing(true);
    // The attribute must be on the DOM before the size changes, otherwise the
    // first frame is a jump and the transition only catches the remainder.
    const frame = requestAnimationFrame(() => panel.resize(open ? lastSize.current : 0));
    const timer = window.setTimeout(() => setGrowing(false), GROW_MS + 80);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [open, wide]);

  const openAt = useCallback((list: Citation[], at: number) => {
    setState({ list, at: Math.min(Math.max(at, 0), Math.max(list.length - 1, 0)) });
  }, []);

  const step = useCallback((delta: number) => {
    setState((current) =>
      current
        ? { ...current, at: (current.at + delta + current.list.length) % current.list.length }
        : current,
    );
  }, []);

  const value = useMemo(
    () => ({ open: openAt, close, isOpen: open }),
    [openAt, close, open],
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  const pane = citation && visible ? (
    <>
      <PaneHeader
        citation={citation}
        position={{ at: visible.at, count: visible.list.length }}
        onPrev={() => step(-1)}
        onNext={() => step(1)}
        onClose={close}
      />
      <PdfPane key={citation.file} file={citation.file} page={citation.page} match={citation.text} />
    </>
  ) : null;

  return (
    <Pane.Provider value={value}>
      {!wide ? (
        citation ? (
          <div className="flex h-svh flex-col">{pane}</div>
        ) : (
          <Inset className="flex min-h-0 flex-1 flex-col">{children}</Inset>
        )
      ) : (
        /* Two inset cards on one gutter. The reader panel stays mounted at zero
           width so opening it is a width change, not a mount. */
        <ResizablePanelGroup
          direction="horizontal"
          data-citation-split
          data-growing={growing ? "" : undefined}
          className="group min-h-0 flex-1 p-2"
        >
          <ResizablePanel
            defaultSize={100 - PANE_SIZE}
            minSize={26}
            className={cn("min-w-0", GROW)}
          >
            <Inset className="flex h-full min-h-0 flex-col">{children}</Inset>
          </ResizablePanel>

          <ResizableHandle
            className={cn(
              "group/handle relative flex items-center justify-center bg-transparent after:hidden focus-visible:outline-none",
              citation ? "w-3" : "w-0",
            )}
          >
            <span
              aria-hidden="true"
              className="flex translate-x-1 flex-col items-center gap-1 transition-opacity duration-150 ease-out"
            >
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  className="size-[3px] rounded-full bg-muted-foreground/60 transition-colors duration-150 ease-out group-hover/handle:bg-muted-foreground group-data-[resize-handle-state=drag]/handle:bg-foreground"
                />
              ))}
            </span>
          </ResizableHandle>

          <ResizablePanel
            ref={panePanel}
            defaultSize={0}
            minSize={0}
            collapsible
            collapsedSize={0}
            className={cn("min-w-0", GROW)}
          >
            <Inset className="flex h-full min-h-0 flex-col bg-sidebar">{pane}</Inset>
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </Pane.Provider>
  );
}
