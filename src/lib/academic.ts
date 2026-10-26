import type Anthropic from "@anthropic-ai/sdk";

const OPENALEX = "https://api.openalex.org/works";
const S2 = "https://api.semanticscholar.org/graph/v1/paper/search";
const MAX_ABSTRACT = 600;

export const ACADEMIC_PER_RUN = 8;

/** OpenAlex works without a key (a small shared daily budget); a free key gives its own. */
export const openAlexKeyed = () => Boolean(process.env.OPENALEX_API_KEY);
/** Semantic Scholar's keyless pool is shared and often rate-limited; a free key makes it dependable. */
export const semanticScholarKeyed = () => Boolean(process.env.SEMANTIC_SCHOLAR_API_KEY);

export const ACADEMIC_TOOLS: Anthropic.Tool[] = [
  {
    name: "academic_search",
    description:
      "Search scholarly papers. mode 'semantic' finds papers by meaning and works best with a full sentence or short paragraph describing the question (OpenAlex). mode 'keyword' matches terms (Semantic Scholar when available, else OpenAlex). Returns title, year, venue, citation count, link and abstract. Abstracts are the authors' own claims. Use for evidence on what research says, not for news or company facts.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Semantic: a full-sentence question. Keyword: a few focused terms." },
        mode: { type: "string", enum: ["semantic", "keyword"] },
        year_from: { type: "integer", description: "Only papers from this year onward, for example 2015." },
      },
      required: ["query"],
    },
  },
];

type Paper = {
  title: string;
  year?: number | null;
  venue?: string | null;
  citations?: number | null;
  link?: string | null;
  authors?: string[];
  type?: string | null;
  abstract?: string | null;
  tldr?: string | null;
};

function abstractFromIndex(idx: Record<string, number[]> | null | undefined): string | null {
  if (!idx) return null;
  const words: string[] = [];
  for (const [w, positions] of Object.entries(idx)) for (const p of positions) words[p] = w;
  const text = words.filter(Boolean).join(" ");
  return text || null;
}

const clip = (s: string | null | undefined) =>
  s ? (s.length > MAX_ABSTRACT ? `${s.slice(0, MAX_ABSTRACT)}…` : s) : null;

function format(source: string, how: string, papers: Paper[]) {
  if (papers.length === 0) return `${source} (${how}): no papers found.`;
  const head = `Source: ${source} (${how}). Paper metadata and abstracts below are the authors' claims; they are not verified findings. A paper seen only as an abstract is "unverified".`;
  return [
    head,
    ...papers.map(
      (p, i) =>
        `${i + 1}. ${p.title}\n   ${[p.year, p.venue, p.type, p.citations != null ? `${p.citations} citations` : null].filter(Boolean).join(" · ")}` +
        `${p.authors?.length ? `\n   authors: ${p.authors.join(", ")}` : ""}` +
        `${p.link ? `\n   link: ${p.link}` : ""}` +
        `${p.tldr ? `\n   summary (auto-generated): ${p.tldr}` : ""}` +
        `${p.abstract ? `\n   abstract: ${clip(p.abstract)}` : ""}`,
    ),
  ].join("\n\n");
}

async function openAlex(query: string, semantic: boolean, yearFrom?: number): Promise<Paper[]> {
  const params = new URLSearchParams({
    [semantic ? "search.semantic" : "search"]: query.slice(0, 1000),
    per_page: "6",
    select: "title,publication_year,cited_by_count,doi,id,type,primary_location,authorships,abstract_inverted_index",
  });
  if (yearFrom) params.set("filter", `publication_year:>${yearFrom - 1}`);
  if (process.env.OPENALEX_API_KEY) params.set("api_key", process.env.OPENALEX_API_KEY);

  const res = await fetch(`${OPENALEX}?${params}`, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) {
    throw new Error(
      res.status === 429 || res.status === 403
        ? "OpenAlex's free daily budget is used up. Add a free OpenAlex key, or try again tomorrow."
        : `OpenAlex failed (HTTP ${res.status}).`,
    );
  }
  const data = (await res.json()) as {
    results?: {
      title: string | null;
      publication_year: number | null;
      cited_by_count: number | null;
      doi: string | null;
      id: string;
      type: string | null;
      primary_location?: { source?: { display_name?: string } | null } | null;
      authorships?: { author?: { display_name?: string } }[];
      abstract_inverted_index?: Record<string, number[]> | null;
    }[];
  };
  return (data.results ?? []).map((w) => ({
    title: w.title ?? "(untitled)",
    year: w.publication_year,
    venue: w.primary_location?.source?.display_name,
    citations: w.cited_by_count,
    link: w.doi ?? w.id,
    type: w.type,
    authors: (w.authorships ?? []).slice(0, 3).map((a) => a.author?.display_name ?? "").filter(Boolean),
    abstract: abstractFromIndex(w.abstract_inverted_index),
  }));
}

async function semanticScholar(query: string, yearFrom?: number): Promise<Paper[]> {
  const params = new URLSearchParams({
    query: query.slice(0, 300),
    limit: "6",
    fields: "title,year,venue,citationCount,abstract,tldr,url,externalIds,publicationTypes,authors",
  });
  if (yearFrom) params.set("year", `${yearFrom}-`);
  const headers: Record<string, string> = {};
  if (process.env.SEMANTIC_SCHOLAR_API_KEY) headers["x-api-key"] = process.env.SEMANTIC_SCHOLAR_API_KEY;

  const res = await fetch(`${S2}?${params}`, { headers, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw Object.assign(new Error(`Semantic Scholar failed (HTTP ${res.status}).`), { status: res.status });
  const data = (await res.json()) as {
    data?: {
      title: string;
      year: number | null;
      venue: string | null;
      citationCount: number | null;
      abstract: string | null;
      tldr?: { text?: string } | null;
      url: string | null;
      externalIds?: { DOI?: string } | null;
      publicationTypes?: string[] | null;
      authors?: { name?: string }[];
    }[];
  };
  return (data.data ?? []).map((p) => ({
    title: p.title,
    year: p.year,
    venue: p.venue,
    citations: p.citationCount,
    link: p.externalIds?.DOI ? `https://doi.org/${p.externalIds.DOI}` : p.url,
    type: p.publicationTypes?.[0],
    authors: (p.authors ?? []).slice(0, 3).map((a) => a.name ?? "").filter(Boolean),
    abstract: p.abstract,
    tldr: p.tldr?.text,
  }));
}

/**
 * Routes a search. Semantic mode uses OpenAlex. Keyword mode prefers Semantic Scholar when a key is set,
 * and falls back to OpenAlex if Semantic Scholar is rate-limited or unavailable.
 */
export async function academicSearch(input: { query?: string; mode?: string; year_from?: number }) {
  const query = input.query?.trim();
  if (!query) throw new Error("query is required");
  const yearFrom = Number.isInteger(input.year_from) ? input.year_from : undefined;

  if (input.mode === "semantic") {
    return format("OpenAlex", "semantic search", await openAlex(query, true, yearFrom));
  }
  if (semanticScholarKeyed()) {
    try {
      return format("Semantic Scholar", "keyword search", await semanticScholar(query, yearFrom));
    } catch {
      const papers = await openAlex(query, false, yearFrom);
      return `Semantic Scholar was unavailable, so this used OpenAlex instead.\n\n${format("OpenAlex", "keyword search", papers)}`;
    }
  }
  return format("OpenAlex", "keyword search (full text)", await openAlex(query, false, yearFrom));
}

/** Free checks used only by the guarded Setup test. */
export async function testOpenAlex() {
  const params = new URLSearchParams({ per_page: "1", select: "id" });
  if (process.env.OPENALEX_API_KEY) params.set("api_key", process.env.OPENALEX_API_KEY);
  const res = await fetch(`${OPENALEX}?${params}`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw Object.assign(new Error("OpenAlex failed"), { status: res.status });
}

export async function testSemanticScholar() {
  await semanticScholar("connection test");
}
