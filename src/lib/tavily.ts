import type Anthropic from "@anthropic-ai/sdk";

const API = "https://api.tavily.com";
const MAX_EXTRACT_CHARS = 12_000;

export const researchConfigured = () => Boolean(process.env.TAVILY_API_KEY);

export const SEARCHES_PER_RUN = 8; // config.md SEARCHES_PER_RUN
export const EXTRACTS_PER_RUN = 6;

export const RESEARCH_TOOLS: Anthropic.Tool[] = [
  {
    name: "web_search",
    description:
      "Search the web. Returns titles, URLs and short snippets. A snippet is not a source: use web_extract on the pages whose facts you will use. Use for why-now evidence, problem evidence, competitors and general AI tools, benchmarks.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Focused search query, one topic." },
        topic: { type: "string", enum: ["general", "news"], description: "Use news for recent events." },
      },
      required: ["query"],
    },
  },
  {
    name: "web_extract",
    description:
      "Open a page and read its content. Use on the 1 to 3 pages whose facts you will cite. Returns the page text, possibly shortened.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Full http(s) URL from a search result or supplied by the user." },
        query: { type: "string", description: "What you are looking for on the page; ranks the relevant parts first." },
      },
      required: ["url"],
    },
  },
];

async function call(path: string, body: unknown) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    const hint =
      res.status === 401
        ? "invalid TAVILY_API_KEY"
        : res.status === 429 || res.status === 432 || res.status === 433
          ? "rate or plan limit reached"
          : `HTTP ${res.status}`;
    throw new Error(`Tavily ${path} failed: ${hint}`);
  }
  return res.json();
}

export async function webSearch(input: { query?: string; topic?: string }) {
  if (!input.query?.trim()) throw new Error("query is required");
  const data = await call("/search", {
    query: input.query.slice(0, 400),
    topic: input.topic === "news" ? "news" : "general",
    search_depth: "basic",
    max_results: 6,
    include_published_date: true,
  });
  const results = (data.results ?? []) as {
    title: string;
    url: string;
    content: string;
    published_date?: string | null;
  }[];
  if (results.length === 0) return "No results.";
  return results
    .map(
      (r, i) =>
        `${i + 1}. ${r.title}\n   ${r.url}${r.published_date ? `\n   published: ${r.published_date}` : ""}\n   snippet (unverified): ${r.content}`,
    )
    .join("\n\n");
}

export async function webExtract(input: { url?: string; query?: string }) {
  let url: URL;
  try {
    url = new URL(input.url ?? "");
  } catch {
    throw new Error("url must be a full http(s) URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("url must be http(s)");

  const data = await call("/extract", {
    urls: url.toString(),
    ...(input.query ? { query: input.query.slice(0, 400), chunks_per_source: 5 } : {}),
    extract_depth: "basic",
    format: "markdown",
  });
  const hit = (data.results ?? [])[0] as { raw_content?: string } | undefined;
  if (!hit?.raw_content) {
    const failed = (data.failed_results ?? [])[0] as { error?: string } | undefined;
    throw new Error(`Could not open the page${failed?.error ? `: ${failed.error}` : ""}`);
  }
  const text = hit.raw_content;
  return text.length > MAX_EXTRACT_CHARS
    ? `${text.slice(0, MAX_EXTRACT_CHARS)}\n\n[truncated at ${MAX_EXTRACT_CHARS} characters]`
    : text;
}

/** Spends 1 Tavily credit. Used only by the guarded Setup test. */
export async function testTavily() {
  await call("/search", { query: "connection test", search_depth: "basic", max_results: 1 });
}
