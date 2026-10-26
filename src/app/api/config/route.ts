import { connection } from "next/server";
import { researchConfigured } from "@/lib/tavily";

/** Tells the UI which optional features are available. Never returns key values. */
export async function GET() {
  await connection();
  return Response.json({
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    research: researchConfigured(),
  });
}
