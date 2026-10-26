import { readFile } from "node:fs/promises";
import path from "node:path";

export type ChecklistRow = { id: string; section: string; title: string; status: string };

/** Reads the living checklist table. Re-read on every call because the user edits it between runs. */
export async function readChecklistRows(): Promise<ChecklistRow[]> {
  let text: string;
  try {
    text = await readFile(path.join(process.cwd(), "data/checklist.md"), "utf8");
  } catch {
    return [];
  }
  return text
    .split("\n")
    .filter((l) => /^\|\s*[A-Z]+\d+\s*\|/.test(l))
    .map((l) => l.split("|").map((c) => c.trim()))
    .map((c) => ({ id: c[1], section: c[2], title: c[3], status: c[5] ?? "" }));
}
