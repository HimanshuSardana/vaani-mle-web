const TAVILY_KEY = process.env.TAVILY_API_KEY;
const SEARXNG_URL = (process.env.SEARXNG_URL ?? "https://search.himanshu.co").replace(/\/+$/, "");
const SEARXNG_KEY = process.env.SEARXNG_API_KEY;

export type WebSource = {
  title: string;
  url: string;
  domain: string;
  snippet: string;
};

function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function toSource(title: string, url: string, snippet: string): WebSource {
  return {
    title: title.trim(),
    url,
    domain: domainOf(url),
    snippet: snippet.replace(/\s+/g, " ").trim().slice(0, 300),
  };
}

async function tavilySearch(query: string, limit: number): Promise<WebSource[]> {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TAVILY_KEY}`,
    },
    body: JSON.stringify({
      query,
      max_results: limit,
      search_depth: "basic",
      include_answer: false,
      include_raw_content: false,
    }),
  });

  if (!response.ok) throw new Error(`Tavily returned ${response.status}`);

  const payload = (await response.json()) as {
    results?: { title?: string; url?: string; content?: string }[];
  };

  return (payload.results ?? [])
    .filter((result) => result.url && result.title)
    .slice(0, limit)
    .map((result) => toSource(result.title!, result.url!, result.content ?? ""));
}

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "what", "when", "where", "which", "how", "why",
  "latest", "stable", "version", "release", "released", "about", "from", "that",
  "this", "into", "your", "does", "have", "has", "are", "was", "were", "can",
]);

/** Engines that drop the query return the same shelf of unrelated pages; a term
 *  overlap check keeps that noise out of the model's context. */
function relevant(query: string, source: WebSource) {
  const terms = query
    .toLowerCase()
    .match(/[a-z0-9.+#:-]{3,}/g)
    ?.filter((term) => !STOP_WORDS.has(term));

  if (!terms?.length) return true;

  const haystack = `${source.title} ${source.url} ${source.snippet}`.toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

async function searxngSearch(query: string, limit: number): Promise<WebSource[]> {
  const url = new URL(`${SEARXNG_URL}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("language", "en");
  url.searchParams.set("safesearch", "1");

  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
    headers: SEARXNG_KEY ? { "X-API-Key": SEARXNG_KEY } : {},
  });

  if (!response.ok) throw new Error(`SearXNG returned ${response.status}`);

  const payload = (await response.json()) as {
    results?: { title?: string; url?: string; content?: string }[];
  };

  const seen = new Set<string>();

  return (payload.results ?? [])
    .filter((result) => result.url && result.title)
    .map((result) => toSource(result.title!, result.url!, result.content ?? ""))
    .filter((source) => {
      if (seen.has(source.url)) return false;
      seen.add(source.url);
      return relevant(query, source);
    })
    .slice(0, limit);
}

export async function webSearch(query: string, limit = 5): Promise<WebSource[]> {
  if (!query.trim()) return [];

  if (TAVILY_KEY) {
    try {
      const sources = await tavilySearch(query, limit);
      if (sources.length) return sources;
    } catch {
      // Fall through to the self-hosted instance.
    }
  }

  try {
    return await searxngSearch(query, limit);
  } catch {
    return [];
  }
}
