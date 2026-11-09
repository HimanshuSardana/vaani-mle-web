import type { Metadata } from "next";
import Link from "next/link";
import { LandingMotion } from "@/components/landing-motion";
import { OpenChatMenu } from "@/components/open-chat-menu";
import { googleEnabled } from "@/lib/config";
import { Mark } from "@/components/mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { ChatLink } from "@/components/transition-link";

const REPO = "https://github.com/HimanshuSardana/recall";

export const metadata: Metadata = {
  title: "recall — a chat agent that remembers",
  description:
    "A chat agent with a dated memory. Ask once, come back next week, and it starts from what you asked before — searching again when a fact could have moved.",
};

const features = [
  {
    title: "Dated log",
    body: "Every question and answer is filed with its timestamp, so “what did I ask on 3 November” is a lookup, not a guess.",
  },
  {
    title: "Recall tool",
    body: "The model searches that log itself, by keywords and by date range, across every chat you have.",
  },
  {
    title: "Last five asks",
    body: "Today’s date and your recent questions ride in the prompt, so most recall happens before any tool call.",
  },
  {
    title: "You can correct it",
    body: "The Memories screen lists what was stored. Forget one entry, or clear all of it.",
  },
];

const steps = [
  ["The prompt", "carries today’s date and your last five questions; the current chat rides along as history."],
  ["Two tools", "— recall reads the dated log, web_search asks Tavily and falls back to a self-hosted SearXNG."],
  ["Sources", "— search results reach the model with their URLs, and the answer ends in the domains it read."],
];

const faq = [
  [
    "Does it remember across chats?",
    "Yes. Turns are stored against your owner id with timestamps, and recall can read all of them — that is how “has anything changed since we spoke” works.",
  ],
  [
    "Where does that live?",
    "A SQLite file on the server: chats and messages for signed-in accounts, memories scoped to your user id or a guest cookie.",
  ],
  [
    "Which model?",
    "DeepSeek V4.1 Flash or Mimo V2.6 Flash over any OpenAI-compatible endpoint you point at with OPENAI_BASE_URL.",
  ],
  [
    "What if search finds nothing?",
    "It says so. Unrelated pages are filtered before they reach the model, and an answer that could not be verified is labelled as such.",
  ],
];

export default function Landing() {
  return (
    <div className="min-h-svh bg-background font-sans text-foreground">
      <LandingMotion />

      <header className="mx-auto flex h-14 w-full max-w-[820px] items-center gap-5 px-6">
        <Link href="/" className="flex items-center gap-2">
          <Mark className="size-3.5 text-foreground" />
          <span className="text-[12.5px] font-semibold tracking-tight">recall</span>
        </Link>

        <nav className="ml-auto hidden items-center gap-4 md:flex">
          {[
            ["Memory", "#memory"],
            ["How it works", "#how"],
            ["FAQ", "#faq"],
            ["GitHub", REPO],
          ].map(([label, href]) => (
            <a
              key={label}
              href={href}
              target={href.startsWith("http") ? "_blank" : undefined}
              rel={href.startsWith("http") ? "noreferrer" : undefined}
              className="text-[12.5px] text-muted-foreground transition-colors duration-150 hover:text-foreground"
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <ThemeToggle className="mr-1" />
          <OpenChatMenu googleEnabled={googleEnabled} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[820px] px-6 pb-24">
        <section className="pt-14 pb-10 md:pt-20">
          <h1 className="max-w-[620px] text-[32px] leading-[1.1] font-normal tracking-[-0.02em] md:text-[40px]">
            Ask once. It remembers.
          </h1>
          <p className="mt-4 max-w-[540px] text-[14px] leading-relaxed text-muted-foreground">
            recall is a chat agent with a dated memory. Ask something today, come back next week, and
            it picks up where you left off — re-checking the web and showing the sources it used.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-2">
            <ChatLink
              className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.97]"
              href="/chat"
            >
              Start chatting
            </ChatLink>
            <a
              href="#how"
              className="inline-flex h-9 items-center rounded-full border border-border bg-card px-4 text-[13px] font-medium text-foreground transition-[background-color,transform] duration-150 hover:bg-accent active:scale-[0.97]"
            >
              See how it works
            </a>
          </div>
        </section>

        <section id="memory" className="mt-12 scroll-mt-6 border-t border-border/70 pt-7">
          <h2 className="text-[10.5px] font-semibold tracking-wide text-foreground uppercase">
            Memory
          </h2>
          <div className="mt-3 divide-y divide-border/60">
            {features.map((feature, index) => (
              <div
                key={feature.title}
                className={`rv rv-${(index % 3) + 1} grid gap-1 py-3.5 sm:grid-cols-[170px_1fr] sm:gap-8`}
              >
                <h3 className="text-[13px] font-medium text-foreground">{feature.title}</h3>
                <p className="text-[13px] leading-relaxed text-muted-foreground">{feature.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="how" className="mt-12 scroll-mt-6 border-t border-border/70 pt-7">
          <h2 className="text-[10.5px] font-semibold tracking-wide text-foreground uppercase">
            How it works
          </h2>
          <ol className="mt-3 divide-y divide-border/60">
            {steps.map(([lead, body], index) => (
              <li key={lead} className="rv grid gap-1 py-3.5 sm:grid-cols-[170px_1fr] sm:gap-8">
                <p className="flex items-baseline gap-2 text-[13px] font-medium text-foreground">
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {lead}
                </p>
                <p className="text-[13px] leading-relaxed text-muted-foreground">{body}</p>
              </li>
            ))}
          </ol>

          <pre className="rv mt-5 overflow-x-auto rounded-xl bg-foreground/[0.04] p-3.5 font-mono text-[12px] leading-relaxed text-muted-foreground dark:bg-foreground/[0.07]">
            <code>{`# run it
npm install
npm run dev            → http://localhost:3000

# keys (see .env.example)
OPENAI_API_KEY=…       # any OpenAI-compatible endpoint
TAVILY_API_KEY=…       # web search; SEARXNG_* is the fallback`}</code>
          </pre>
        </section>

        <section id="faq" className="mt-12 scroll-mt-6 border-t border-border/70 pt-7">
          <h2 className="text-[10.5px] font-semibold tracking-wide text-foreground uppercase">FAQ</h2>
          <div className="mt-3 divide-y divide-border/60">
            {faq.map(([question, answer]) => (
              <div key={question} className="rv py-3.5">
                <p className="text-[13px] font-medium text-foreground">{question}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{answer}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-12 flex flex-wrap items-center gap-3 border-t border-border/70 pt-6 text-[11.5px] text-muted-foreground">
          <Mark className="size-3 text-muted-foreground" />
          <span>recall — built for the minimi intern challenge</span>
          <a
            href={REPO}
            target="_blank"
            rel="noreferrer"
            className="ml-auto transition-colors duration-150 hover:text-foreground"
          >
            GitHub
          </a>
          <a
            href="https://himanshu.co"
            target="_blank"
            rel="noreferrer"
            className="transition-colors duration-150 hover:text-foreground"
          >
            Himanshu
          </a>
        </footer>
      </main>
    </div>
  );
}
