import Anthropic from "@anthropic-ai/sdk";
import { testOpenAlex, testSemanticScholar } from "@/lib/academic";
import { researchConfigured, testTavily } from "@/lib/tavily";

type Result = { ok: boolean; message: string };

/** Never echoes a key or a raw provider error: only a fixed, plain-language message. */
function describe(err: unknown, provider: string): Result {
  const status = (err as { status?: number })?.status;
  if (status === 401 || status === 403 || /invalid TAVILY_API_KEY/.test(String((err as Error)?.message)))
    return { ok: false, message: `${provider} rejected the key. Check that you copied all of it, with no spaces, and that it hasn't been revoked.` };
  if (status === 429 || /limit/.test(String((err as Error)?.message)))
    return { ok: false, message: `${provider} says you've hit a rate or plan limit. Wait a moment or check your plan.` };
  return { ok: false, message: `Couldn't reach ${provider}. Check your connection and try again.` };
}

/**
 * Checks a key server-side. Off in production unless ALLOW_SETUP_TEST=1, because this app has no login:
 * on a public deployment anyone could use the endpoint to spend your credits.
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_SETUP_TEST !== "1") {
    return Response.json(
      { ok: false, message: "Connection tests are off on deployed copies. Run the app locally to test your keys." },
      { status: 403 },
    );
  }
  const body = await req.json().catch(() => null);
  const provider = body?.provider;

  if (provider === "anthropic") {
    if (!process.env.ANTHROPIC_API_KEY)
      return Response.json({ ok: false, message: "No ANTHROPIC_API_KEY found. Add it to .env.local and restart the dev server." });
    try {
      await new Anthropic().models.list({ limit: 1 });
      return Response.json({ ok: true, message: "Anthropic accepted the key. This check is free." } satisfies Result);
    } catch (err) {
      return Response.json(describe(err, "Anthropic"));
    }
  }

  if (provider === "tavily") {
    if (!researchConfigured())
      return Response.json({ ok: false, message: "No TAVILY_API_KEY found. Add it to .env.local and restart the dev server." });
    try {
      await testTavily();
      return Response.json({ ok: true, message: "Tavily accepted the key. This check used 1 search credit." } satisfies Result);
    } catch (err) {
      return Response.json(describe(err, "Tavily"));
    }
  }

  if (provider === "openalex") {
    try {
      await testOpenAlex();
      return Response.json({
        ok: true,
        message: process.env.OPENALEX_API_KEY
          ? "OpenAlex accepted the request with your key. This check is free."
          : "OpenAlex is reachable without a key, using a small shared daily budget. A free key gives you your own.",
      } satisfies Result);
    } catch (err) {
      return Response.json(describe(err, "OpenAlex"));
    }
  }

  if (provider === "semanticscholar") {
    try {
      await testSemanticScholar();
      return Response.json({
        ok: true,
        message: process.env.SEMANTIC_SCHOLAR_API_KEY ? "Semantic Scholar accepted your key." : "Semantic Scholar answered without a key.",
      } satisfies Result);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      return Response.json(
        status === 429 && !process.env.SEMANTIC_SCHOLAR_API_KEY
          ? { ok: false, message: "Semantic Scholar rate-limited the shared keyless pool. This is common; add a free key, or rely on OpenAlex." }
          : describe(err, "Semantic Scholar"),
      );
    }
  }

  return Response.json({ ok: false, message: "Unknown provider." }, { status: 400 });
}
