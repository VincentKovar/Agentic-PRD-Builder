export const STAGES = [
  { id: "intake", label: "Brief", phase: 0, hint: "Confirming your idea and the checklist" },
  { id: "discover", label: "Discover", phase: 1, hint: "The problem, who has it, and why now" },
  { id: "design", label: "Design", phase: 2, hint: "What the product does and how it earns trust" },
  { id: "develop", label: "Develop", phase: 3, hint: "Requirements, tests and tool permissions" },
  { id: "deploy", label: "Deploy", phase: 4, hint: "Rollout, cost limits and when it must stop" },
  { id: "qa", label: "Check", phase: 0, hint: "Scoring the draft against the checklist" },
  { id: "deliver", label: "Finish", phase: 0, hint: "Download the PRD and close the open gaps" },
] as const;

export type StageId = (typeof STAGES)[number]["id"];

export type Check = { id: string; result: "pass" | "partial" | "missing"; note?: string };

export type SetItem = { item: string; why?: string; section?: string };

export type Msg = { role: "user" | "assistant"; content: string };

const TAGS = ["stage", "prd", "checks", "set", "choices", "error", "status"];

/** Last occurrence of <tag>…</tag>. While streaming, an unclosed tag returns what has arrived so far. */
export function extract(text: string, tag: string, allowPartial = false): string | null {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
  let last: string | null = null;
  for (const m of text.matchAll(re)) last = m[1];
  if (allowPartial) {
    const open = text.lastIndexOf(`<${tag}>`);
    if (open !== -1 && text.indexOf(`</${tag}>`, open) === -1) {
      return text.slice(open + tag.length + 2);
    }
  }
  return last;
}

export function stripTags(text: string): string {
  let out = text;
  for (const t of TAGS) {
    out = out.replace(new RegExp(`<${t}>[\\s\\S]*?</${t}>`, "g"), "");
    out = out.replace(new RegExp(`<${t}>[\\s\\S]*$`), "");
  }
  return out.replace(/<[a-z]{0,8}$/, "").trim();
}

function json<T>(raw: string | null, guard: (v: unknown) => v is T): T | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return guard(v) ? v : null;
  } catch {
    return null;
  }
}

const isStrings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");
/** SET items arrive as plain strings or as {item, why, section} objects. */
const isSetItems = (v: unknown): v is (string | SetItem)[] =>
  Array.isArray(v) &&
  v.every((x) => typeof x === "string" || (x && typeof x === "object" && typeof (x as SetItem).item === "string"));
const toSetItem = (x: string | SetItem): SetItem =>
  typeof x === "string" ? { item: x.replace(/^SET:\s*/i, "") } : { ...x, item: x.item.replace(/^SET:\s*/i, "") };
const isChecks = (v: unknown): v is Check[] =>
  Array.isArray(v) &&
  v.every(
    (x) =>
      x &&
      typeof x.id === "string" &&
      (x.result === "pass" || x.result === "partial" || x.result === "missing"),
  );

export type Derived = {
  stage: StageId;
  prd: string;
  checks: Check[];
  setItems: SetItem[];
  choices: string[];
  error: string | null;
  status: string | null;
};

/** Latest value of each tag across the conversation, scanning assistant messages newest first. */
export function derive(messages: Msg[], streaming: boolean): Derived {
  const assistant = messages.filter((m) => m.role === "assistant").map((m) => m.content);
  const newest = (fn: (t: string) => unknown) => {
    for (let i = assistant.length - 1; i >= 0; i--) {
      const v = fn(assistant[i]);
      if (v !== null && v !== undefined) return v;
    }
    return null;
  };
  const stage = newest((t) => extract(t, "stage")?.trim() ?? null) as string | null;
  const lastText = assistant[assistant.length - 1] ?? "";
  return {
    stage: STAGES.some((s) => s.id === stage) ? (stage as StageId) : "intake",
    prd: (newest((t) => extract(t, "prd", true)) as string | null)?.trim() ?? "",
    checks: (newest((t) => json(extract(t, "checks"), isChecks)) as Check[] | null) ?? [],
    setItems: ((newest((t) => json(extract(t, "set"), isSetItems)) as (string | SetItem)[] | null) ?? []).map(toSetItem),
    choices: streaming ? [] : (json(extract(lastText, "choices"), isStrings) ?? []),
    error: extract(lastText, "error"),
    status: streaming ? (extract(lastText, "status")?.trim() ?? null) : null,
  };
}
