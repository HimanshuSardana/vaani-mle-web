"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** pdf.js renders pages to canvas, so the pane can scroll to an exact page and
 *  look the same everywhere. The worker is served from /public — it must stay on
 *  the same version as pdfjs-dist. */

type Rect = { left: number; top: number; width: number; height: number };
type TextItem = { str: string; width: number; transform: number[] };
type Viewport = { transform: number[]; width: number; height: number };

const collapse = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();

function multiply(m1: number[], m2: number[]) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

/** Finds the passage in the page's text items and returns one box per line, as
 *  percentages of the page, so the overlay tracks the canvas at any size. */
function boxForPassage(items: TextItem[], viewport: Viewport, needle: string): Rect[] {
  let joined = "";
  const spans: { start: number; end: number; item: TextItem }[] = [];

  for (const item of items) {
    const text = collapse(item.str);
    if (!text) continue;
    if (joined) joined += " ";
    const start = joined.length;
    joined += text;
    spans.push({ start, end: joined.length, item });
  }

  const target = collapse(needle);
  if (!target) return [];

  let at = -1;
  for (const size of [140, 96, 56, 28]) {
    at = joined.indexOf(target.slice(0, size));
    if (at >= 0) break;
  }
  if (at < 0) return [];

  const until = at + Math.min(target.length, 700);
  const boxes: Rect[] = [];

  for (const span of spans) {
    if (span.end <= at) continue;
    if (span.start >= until) break;

    const tx = multiply(viewport.transform, span.item.transform);
    const height = Math.hypot(tx[2], tx[3]);

    boxes.push({
      left: ((tx[4] - 2) / viewport.width) * 100,
      top: ((tx[5] - height) / viewport.height) * 100,
      width: ((span.item.width + 4) / viewport.width) * 100,
      height: ((height * 1.12) / viewport.height) * 100,
    });
  }

  // One box per visual line instead of one per word.
  return boxes
    .sort((a, b) => (Math.abs(a.top - b.top) < 0.4 ? a.left - b.left : a.top - b.top))
    .reduce<Rect[]>((merged, box) => {
      const last = merged.at(-1);
      if (last && Math.abs(last.top - box.top) < 0.4 && box.left <= last.left + last.width + 1.2) {
        const right = Math.max(last.left + last.width, box.left + box.width);
        last.width = right - last.left;
        last.height = Math.max(last.height, box.height);
        return merged;
      }
      merged.push({ ...box });
      return merged;
    }, []);
}

function PdfPage({
  doc,
  index,
  aspect,
  active,
  match,
}: {
  doc: PDFDocumentProxy;
  index: number;
  aspect: number;
  active: boolean;
  match?: string;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  const [boxes, setBoxes] = useState<Rect[]>([]);

  useEffect(() => {
    const element = holder.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { root: element.closest("[data-scroller]"), rootMargin: "700px 0px" },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!near) return;
    let cancelled = false;
    let task: { cancel: () => void } | null = null;

    (async () => {
      const page = await doc.getPage(index + 1);
      if (cancelled) return;

      const element = holder.current;
      const target = canvas.current;
      if (!element || !target) return;

      const base = page.getViewport({ scale: 1 });
      const width = element.clientWidth || 600;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: (width / base.width) * ratio });

      target.width = Math.floor(viewport.width);
      target.height = Math.floor(viewport.height);
      target.style.width = "100%";
      target.style.height = "auto";

      const render = page.render({ canvas: target, viewport });
      task = render;
      await render.promise.catch(() => undefined);
    })();

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [near, doc, index]);

  // The cited passage is marked on the page that was opened for it, not on every page.
  useEffect(() => {
    if (!near || !active || !match) return;
    let cancelled = false;

    (async () => {
      const page = await doc.getPage(index + 1);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      if (cancelled) return;
      setBoxes(
        boxForPassage(content.items as unknown as TextItem[], viewport, match),
      );
    })().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [near, active, match, doc, index]);

  // Open on the passage, not on the top of its page.
  const located = useRef<string | null>(null);
  useEffect(() => {
    if (!active || boxes.length === 0) return;
    const key = `${index}:${match?.slice(0, 24) ?? ""}`;
    if (located.current === key) return;

    const element = holder.current;
    const container = element?.closest<HTMLElement>("[data-scroller]");
    if (!element || !container) return;

    located.current = key;
    const offset = element.offsetTop + (boxes[0].top / 100) * element.offsetHeight;
    container.scrollTop = Math.max(0, offset - 24);
  }, [active, boxes, index, match]);

  return (
    <div
      ref={holder}
      data-page={index + 1}
      className={cn(
        "relative mx-auto w-full max-w-[860px] overflow-hidden rounded-xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08),0_12px_32px_-16px_rgba(0,0,0,0.35)] transition-shadow duration-200 ease-out",
        active && "ring-1 ring-ring/30",
      )}
      style={{ aspectRatio: `1 / ${aspect}` }}
    >
      <canvas ref={canvas} className="block w-full" />

      {boxes.map((box, index) => (
        <span
          key={index}
          aria-hidden="true"
          // A PDF page is white in either theme, so the wash must not follow the
          // theme's blend mode: screen over white made the mark vanish in dark mode.
          className="pointer-events-none absolute rounded-[2px] bg-amber-300/55 mix-blend-multiply"
          style={{
            left: `${box.left}%`,
            top: `${box.top}%`,
            width: `${box.width}%`,
            height: `${box.height}%`,
          }}
        />
      ))}

      {!near && (
        <span className="absolute inset-0 grid place-items-center text-[11px] text-muted-foreground">
          {index + 1}
        </span>
      )}
    </div>
  );
}

export function PdfPane({
  file,
  page,
  match,
  className,
}: {
  file: string;
  page: number;
  /** Raw passage text; the page's matching lines get marked. */
  match?: string;
  className?: string;
}) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [aspect, setAspect] = useState(1.294);
  const [failed, setFailed] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    let loading: ReturnType<typeof import("pdfjs-dist")["getDocument"]> | null = null;

    (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

      loading = pdfjs.getDocument({ url: file });

      try {
        const loaded = await loading.promise;
        if (!live) {
          void loading?.destroy();
          return;
        }

        const first = await loaded.getPage(1);
        const viewport = first.getViewport({ scale: 1 });
        setAspect(viewport.height / viewport.width);
        setDoc(loaded);
      } catch {
        if (live) setFailed(true);
      }
    })();

    return () => {
      live = false;
      void loading?.destroy();
    };
  }, [file]);

  useEffect(() => {
    if (!doc) return;
    const container = scroller.current;
    const target = container?.querySelector<HTMLElement>(`[data-page="${page}"]`);
    if (!container || !target) return;
    container.scrollTop = target.offsetTop;
  }, [doc, page]);

  if (failed) {
    return (
      <div className="grid flex-1 place-items-center px-6 text-center">
        <p className="text-[12px] text-muted-foreground">
          The PDF could not be loaded in this pane.{" "}
          <a
            href={file}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Open it directly
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <div
      ref={scroller}
      data-scroller
      className={cn("min-h-0 flex-1 space-y-5 overflow-y-auto p-4 lg:p-6", className)}
    >
      {doc ? (
        Array.from({ length: doc.numPages }, (_, index) => (
          <PdfPage
            key={index}
            doc={doc}
            index={index}
            aspect={aspect}
            active={index + 1 === page}
            match={match}
          />
        ))
      ) : (
        <div className="grid h-full place-items-center text-[11.5px] text-muted-foreground">
          Loading the paper…
        </div>
      )}
    </div>
  );
}
