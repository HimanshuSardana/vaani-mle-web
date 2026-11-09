import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

const components: Components = {
  a: ({ node, ...props }) => (
    <a
      {...props}
      target="_blank"
      rel="noreferrer"
      className="underline underline-offset-2 hover:text-muted-foreground"
    />
  ),
  p: ({ node, ...props }) => <p {...props} />,
  strong: ({ node, ...props }) => <strong {...props} className="font-semibold" />,
  ul: ({ node, ...props }) => <ul {...props} className="list-disc space-y-1 pl-5" />,
  ol: ({ node, ...props }) => <ol {...props} className="list-decimal space-y-1 pl-5" />,
  li: ({ node, ...props }) => <li {...props} className="pl-0.5" />,
  h1: ({ node, ...props }) => <h1 {...props} className="mt-5 mb-2 text-[16px] font-semibold" />,
  h2: ({ node, ...props }) => <h2 {...props} className="mt-5 mb-2 text-[15px] font-semibold" />,
  h3: ({ node, ...props }) => <h3 {...props} className="mt-4 mb-1.5 text-[14px] font-semibold" />,
  blockquote: ({ node, ...props }) => (
    <blockquote {...props} className="border-l-2 border-border pl-3 text-muted-foreground" />
  ),
  hr: ({ node, ...props }) => <hr {...props} className="my-4 border-border" />,
  code: ({ node, className, ...props }) => (
    <code
      {...props}
      className={
        className
          ? className
          : "rounded bg-foreground/[0.06] px-1 py-0.5 font-mono text-[12.5px] dark:bg-foreground/10"
      }
    />
  ),
  pre: ({ node, ...props }) => (
    <pre
      {...props}
      className="overflow-x-auto rounded-xl bg-foreground/[0.04] p-3 font-mono text-[12.5px] leading-relaxed dark:bg-foreground/[0.07] [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-[12.5px] [scrollbar-width:thin]"
    />
  ),
  table: ({ node, ...props }) => (
    <div className="overflow-x-auto">
      <table {...props} className="w-full border-collapse text-[13px]" />
    </div>
  ),
  th: ({ node, ...props }) => (
    <th {...props} className="border-b border-border px-2 py-1.5 text-left font-medium" />
  ),
  td: ({ node, ...props }) => <td {...props} className="border-b border-border px-2 py-1.5" />,
};

export function Markdown({ children, streaming = false }: { children: string; streaming?: boolean }) {
  return (
    <div
      className={cn(
        "text-[14px] leading-relaxed text-foreground [&>:first-child]:mt-0 [&>:not(:first-child)]:mt-3",
        streaming && children && "caret-inline",
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
