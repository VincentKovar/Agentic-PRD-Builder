import { connection } from "next/server";
import { readChecklistRows } from "@/lib/checklist";

/** Row titles so the UI can show what each checklist ID means. */
export async function GET() {
  await connection();
  return Response.json({ rows: await readChecklistRows() });
}
