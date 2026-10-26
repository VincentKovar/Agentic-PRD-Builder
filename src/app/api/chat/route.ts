import Anthropic from "@anthropic-ai/sdk";
import { ACADEMIC_PER_RUN, ACADEMIC_TOOLS, academicSearch } from "@/lib/academic";
import { buildSystem } from "@/lib/prompt";
import {
  EXTRACTS_PER_RUN,
  RESEARCH_TOOLS,
  SEARCHES_PER_RUN,
  researchConfigured,
  webExtract,
  webSearch,
} from "@/lib/tavily";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";
const MAX_MESSAGES = 120;
const MAX_CHARS = 200_000;
const MAX_TURNS = 20; // model turns per request, a backstop on the tool loop

type Msg = { role: "user" | "assistant"; content: string };
type Sources = { web: boolean; academic: boolean };
type Body = { messages: Msg[]; research?: boolean | Partial<Sources> };

function validBody(body: unknown): body is Body {
  if (!body || typeof body !== "object" || !("messages" in body)) return false;
  const m = (body as { messages: unknown }).messages;
  return (
    Array.isArray(m) &&
    m.length > 0 &&
    m.length <= MAX_MESSAGES &&
    m[m.length - 1]?.role === "user" &&
    m.every(
      (x) =>
        x &&
        (x.role === "user" || x.role === "assistant") &&
        typeof x.content === "string" &&
        x.content.length > 0,
    ) &&
    m.reduce((n: number, x: Msg) => n + x.content.length, 0) <= MAX_CHARS
  );
}

/** Status lines are for the UI only; the model never needs to see them again. */
const withoutStatus = (s: string) => s.replace(/<status>[\s\S]*?<\/status>/g, "").trim();

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the dev server." },
      { status: 500 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!validBody(body)) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  // A plain `true` from older saved runs means web research only.
  const r = body.research;
  const sources: Sources =
    typeof r === "object" && r !== null ? { web: r.web === true, academic: r.academic === true } : { web: r === true, academic: false };
  if (sources.web && !researchConfigured()) {
    return Response.json(
      { error: "Web research is on but TAVILY_API_KEY is not set. Add it to .env.local, restart, or turn web research off." },
      { status: 500 },
    );
  }
  const tools = [...(sources.web ? RESEARCH_TOOLS : []), ...(sources.academic ? ACADEMIC_TOOLS : [])];

  const { stable, checklist } = await buildSystem(sources);
  const client = new Anthropic();
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: stable, cache_control: { type: "ephemeral" } },
    {
      type: "text",
      text: checklist
        ? `# Living checklist (checklist.md)\n\n${checklist}`
        : "# Living checklist\n\nchecklist.md is missing. Gate G1 applies: offer to create a starter copy from references/checklist-seed.md.",
    },
  ];

  const history: Anthropic.MessageParam[] = body.messages
    .map((m) => ({ role: m.role, content: m.role === "assistant" ? withoutStatus(m.content) : m.content }))
    .filter((m) => m.content.length > 0);

  const encoder = new TextEncoder();
  let active: ReturnType<typeof client.messages.stream> | null = null;

  const out = new ReadableStream({
    async start(controller) {
      const send = (s: string) => controller.enqueue(encoder.encode(s));
      const status = (s: string) => send(`<status>${s.replace(/[<>]/g, "")}</status>`);
      let searches = 0;
      let extracts = 0;
      let papers = 0;

      try {
        const messages = [...history];
        for (let turn = 0; turn < MAX_TURNS; turn++) {
          active = client.messages.stream(
            {
              model: MODEL,
              max_tokens: 16000,
              system,
              messages,
              ...(tools.length ? { tools } : {}),
            },
            { signal: req.signal },
          );
          for await (const ev of active) {
            if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") send(ev.delta.text);
          }
          const final = await active.finalMessage();
          if (final.stop_reason !== "tool_use") break;

          const uses = final.content.filter((b: Anthropic.ContentBlock): b is Anthropic.ToolUseBlock => b.type === "tool_use");
          messages.push({ role: "assistant", content: final.content as Anthropic.ContentBlockParam[] });

          const results: Anthropic.ToolResultBlockParam[] = [];
          for (const u of uses) {
            const input = (u.input ?? {}) as Record<string, string>;
            try {
              if (u.name === "web_search") {
                if (searches >= SEARCHES_PER_RUN) throw new Error(`Search cap reached (${SEARCHES_PER_RUN}). Stop searching and ask the user to paste evidence, or mark the item SET.`);
                searches++;
                status(`Searching: ${input.query ?? ""} (${searches}/${SEARCHES_PER_RUN})`);
                results.push({ type: "tool_result", tool_use_id: u.id, content: await webSearch(input) });
              } else if (u.name === "web_extract") {
                if (extracts >= EXTRACTS_PER_RUN) throw new Error(`Page-open cap reached (${EXTRACTS_PER_RUN}). Mark remaining pages as unverified.`);
                extracts++;
                let host = input.url ?? "";
                try {
                  host = new URL(host).hostname;
                } catch {
                  /* leave as given */
                }
                status(`Reading: ${host}`);
                results.push({ type: "tool_result", tool_use_id: u.id, content: await webExtract(input) });
              } else if (u.name === "academic_search") {
                if (papers >= ACADEMIC_PER_RUN) throw new Error(`Paper-search cap reached (${ACADEMIC_PER_RUN}). Stop searching and say what the evidence you have does and does not show.`);
                papers++;
                const mode = input.mode === "semantic" ? "semantic" : "keyword";
                status(`Searching papers (${mode}): ${input.query ?? ""} (${papers}/${ACADEMIC_PER_RUN})`);
                results.push({
                  type: "tool_result",
                  tool_use_id: u.id,
                  content: await academicSearch({ query: input.query, mode: input.mode, year_from: Number(input.year_from) || undefined }),
                });
              } else {
                throw new Error(`Unknown tool ${u.name}`);
              }
            } catch (err) {
              results.push({
                type: "tool_result",
                tool_use_id: u.id,
                is_error: true,
                content: err instanceof Error ? err.message : "Tool failed.",
              });
            }
          }
          messages.push({ role: "user", content: results });
          send("\n\n");
        }
        controller.close();
      } catch (err) {
        if (!req.signal.aborted) {
          const message = err instanceof Error ? err.message : "Stream failed.";
          send(`\n\n<error>${message.replace(/[<>]/g, "")}</error>`);
        }
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      active?.abort();
    },
  });

  return new Response(out, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
