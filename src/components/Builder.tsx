"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { friendlyError } from "@/lib/errors";
import { STAGES, derive, extract, stripTags, type Msg } from "@/lib/parse";
import type { ChecklistRow } from "@/lib/checklist";
import { SAMPLE_MESSAGES } from "@/lib/sample";

type Run = { id: string; title: string; messages: Msg[]; updatedAt: number; research?: boolean; sources?: Sources };
type Tab = "prd" | "checks" | "set";
type Pane = "chat" | "work";
type View = Tab | "chat";
type Sources = { web: boolean; academic: boolean };
type Features = { anthropic: boolean; research: boolean; academic: boolean; openalexKey?: boolean; semanticScholarKey?: boolean };
const NO_SOURCES: Sources = { web: false, academic: false };
const anySource = (s: Sources) => s.web || s.academic;
const defaultSources = (f: Features | null): Sources => ({ web: f?.research ?? false, academic: f?.academic ?? false });

const STORE = "prd-builder-runs";
const PHASES = STAGES.filter((s) => s.phase > 0).length;

const SAMPLE_IDEA =
  "An agent that reviews vendor contracts for a legal team and flags clauses that need a lawyer.";

const subscribeLg = (cb: () => void) => {
  const mq = window.matchMedia("(min-width: 1024px)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const useIsLg = () =>
  useSyncExternalStore(
    subscribeLg,
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => false,
  );

/** Marks SET and proposed labels as inline code so Md can render them as chips. */
const markChips = (s: string) =>
  s.replace(/\bSET:\s*/g, "`SET` ").replace(/\((?:proposed)\)|\*proposed\*|_proposed_/gi, "`proposed`");

function SetChip() {
  return (
    <span className="chip chip-set" title="Needs your input: only you can confirm or supply this">
      SET
    </span>
  );
}

function Md({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ children, className }) {
          const t = String(children);
          if (t === "SET") return <SetChip />;
          if (t === "proposed")
            return (
              <span className="chip chip-proposed" title="A starting value you haven't confirmed yet">
                proposed
              </span>
            );
          return <code className={className}>{children}</code>;
        },
      }}
    >
      {markChips(text)}
    </ReactMarkdown>
  );
}

function Dot() {
  return (
    <>
      <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-accent" aria-hidden />
      <span className="sr-only"> (updated)</span>
    </>
  );
}

/** Four dots for the four phases: filled = confirmed, ringed = current. */
function PhaseDots({ phase, finished }: { phase: number; finished: boolean }) {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden>
      {Array.from({ length: PHASES }, (_, i) => {
        const n = i + 1;
        const done = finished || n < phase;
        return (
          <span
            key={n}
            className={`h-2 w-2 rounded-full border ${
              done ? "border-accent bg-accent" : n === phase ? "border-accent ring-2 ring-accent/30" : "border-rule"
            }`}
          />
        );
      })}
    </span>
  );
}

function loadRuns(): Run[] {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as Run[]) : [];
  } catch {
    return [];
  }
}

function saveRuns(runs: Run[]) {
  try {
    localStorage.setItem(STORE, JSON.stringify(runs));
  } catch {
    /* storage unavailable: the run just won't persist */
  }
}

function titleOf(messages: Msg[]) {
  const first = messages.find((m) => m.role === "user")?.content.split("\n\n(Research:")[0] ?? "Untitled";
  const heading = extract(messages.map((m) => m.content).join("\n"), "prd")?.match(/^#\s+(.+)$/m)?.[1];
  return (heading ?? first).replace(/\s+/g, " ").slice(0, 60);
}

export default function Builder() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [netError, setNetError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("prd");
  const [pane, setPane] = useState<Pane>("chat");
  const [seen, setSeen] = useState<Record<Tab, string>>({ prd: "", checks: "", set: "" });
  const isLg = useIsLg();
  const [showRuns, setShowRuns] = useState(false);
  const [copied, setCopied] = useState(false);
  const [features, setFeatures] = useState<Features | null>(null);
  const [sources, setSources] = useState<Sources>(NO_SOURCES);
  const [sample, setSample] = useState(false);
  const [rowInfo, setRowInfo] = useState<Record<string, ChecklistRow>>({});
  const abortRef = useRef<AbortController | null>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  const replyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const stored = loadRuns();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from localStorage after mount
    setRuns(stored);
    fetch("/api/config")
      .then((r) => r.json())
      .then((f: Features) => {
        setFeatures(f);
        setSources(defaultSources(f));
      })
      .catch(() => setFeatures({ anthropic: false, research: false, academic: false }));
    fetch("/api/checklist")
      .then((r) => r.json())
      .then((j: { rows: ChecklistRow[] }) => setRowInfo(Object.fromEntries(j.rows.map((r) => [r.id, r]))))
      .catch(() => {
        /* rows fall back to bare IDs */
      });
  }, []);

  const d = useMemo(() => derive(messages, streaming), [messages, streaming]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  useEffect(() => {
    if (!streaming && messages.length > 0) replyRef.current?.focus({ preventScroll: true });
  }, [streaming, messages.length]);

  // One navigation model: a dot on a tab means it changed since you last looked at it.
  const sigs: Record<Tab, string> = {
    prd: d.prd ? String(d.prd.length) : "",
    checks: d.checks.length ? `${d.checks.length}:${d.checks.map((c) => c.result[0]).join("")}` : "",
    set: d.setItems.length ? d.setItems.map((x) => x.item).join("|") : "",
  };
  const viewing = (id: Tab) => tab === id && (pane === "work" || isLg);
  const changed = (id: Tab) => sigs[id] !== "" && sigs[id] !== seen[id] && !viewing(id);
  const openView = (v: View) => {
    const mark = [...(viewing(tab) ? [tab] : []), ...(v === "chat" ? [] : [v])];
    setSeen((prev) => ({ ...prev, ...Object.fromEntries(mark.map((id) => [id, sigs[id]])) }));
    if (v === "chat") setPane("chat");
    else {
      setTab(v);
      setPane("work");
    }
  };

  const persist = useCallback((id: string, msgs: Msg[], withSources: Sources) => {
    setRuns((prev) => {
      const next = [
        { id, title: titleOf(msgs), messages: msgs, updatedAt: Date.now(), sources: withSources },
        ...prev.filter((r) => r.id !== id),
      ];
      saveRuns(next);
      return next;
    });
  }, []);

  const send = useCallback(
    async (text: string, base: Msg[] = messages) => {
      const content = text.trim();
      if (!content || streaming || sample) return;
      const id = runId ?? crypto.randomUUID();
      if (!runId) setRunId(id);

      const history: Msg[] = [...base, { role: "user", content }];
      setMessages([...history, { role: "assistant", content: "" }]);
      setInput("");
      setNetError(null);
      setStreaming(true);

      const ctl = new AbortController();
      abortRef.current = ctl;
      let acc = "";
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history, research: sources }),
          signal: ctl.signal,
        });
        if (!res.ok || !res.body) {
          const err = await res.json().catch(() => null);
          throw new Error(err?.error ?? `Request failed (${res.status})`);
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += dec.decode(value, { stream: true });
          setMessages([...history, { role: "assistant", content: acc }]);
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") setNetError((e as Error).message);
      } finally {
        setStreaming(false);
        abortRef.current = null;
        const final: Msg[] = acc ? [...history, { role: "assistant", content: acc }] : history;
        setMessages(final);
        persist(id, final, sources);
      }
    },
    [messages, streaming, sample, runId, sources, persist],
  );

  const openRun = (r: Run) => {
    setSample(false);
    setRunId(r.id);
    setMessages(r.messages);
    const saved = r.sources ?? { web: r.research === true, academic: false };
    setSources({ web: saved.web && (features?.research ?? false), academic: saved.academic && (features?.academic ?? false) });
    setShowRuns(false);
    setNetError(null);
    setPane("chat");
  };

  const newRun = () => {
    abortRef.current?.abort();
    setSample(false);
    setRunId(null);
    setMessages([]);
    setInput("");
    setShowRuns(false);
    setNetError(null);
    setPane("chat");
    setSources(defaultSources(features));
  };

  const openSample = () => {
    setSample(true);
    setRunId(null);
    setMessages(SAMPLE_MESSAGES);
    setSources(NO_SOURCES);
    setNetError(null);
    setInput("");
    setShowRuns(false);
    setTab("prd");
    setPane("work");
  };

  const deleteRun = (r: Run) => {
    if (!window.confirm(`Delete "${r.title}"? This can't be undone.`)) return;
    const next = runs.filter((x) => x.id !== r.id);
    setRuns(next);
    saveRuns(next);
    if (r.id === runId) newRun();
  };

  const retry = () => {
    const idx = messages.map((m) => m.role).lastIndexOf("user");
    if (idx === -1) return;
    void send(messages[idx].content, messages.slice(0, idx));
  };

  const copyPrd = async () => {
    try {
      await navigator.clipboard.writeText(d.prd);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  /** Moves to the interview with a drafted reply so a gap can be fixed in one step. */
  const draftReply = (text: string) => {
    setInput(text);
    openView("chat");
    setTimeout(() => replyRef.current?.focus(), 0);
  };

  const onTabKey = <T extends string>(e: React.KeyboardEvent, ids: T[], current: T, go: (id: T) => void, prefix: string) => {
    const i = ids.indexOf(current);
    const next =
      e.key === "ArrowRight"
        ? ids[(i + 1) % ids.length]
        : e.key === "ArrowLeft"
          ? ids[(i - 1 + ids.length) % ids.length]
          : e.key === "Home"
            ? ids[0]
            : e.key === "End"
              ? ids[ids.length - 1]
              : null;
    if (!next) return;
    e.preventDefault();
    go(next);
    document.getElementById(`${prefix}-${next}`)?.focus();
  };

  const stageIndex = STAGES.findIndex((s) => s.id === d.stage);
  const stage = STAGES[stageIndex];
  const started = messages.length > 0;
  const counts = {
    pass: d.checks.filter((c) => c.result === "pass").length,
    partial: d.checks.filter((c) => c.result === "partial").length,
    missing: d.checks.filter((c) => c.result === "missing").length,
  };
  const errorRaw = netError ?? d.error;
  const tabIds: Tab[] = ["prd", "checks", "set"];
  const viewIds: View[] = ["chat", ...tabIds];
  const activeView: View = pane === "chat" ? "chat" : tab;
  const tabLabel = (id: Tab, short: boolean) =>
    id === "prd"
      ? "PRD"
      : id === "checks"
        ? d.checks.length
          ? `Checklist ${counts.pass}/${d.checks.length}`
          : "Checklist"
        : `${short ? "Needs input" : "Needs your input"}${d.setItems.length ? ` (${d.setItems.length})` : ""}`;
  const finished = d.stage === "deliver";
  const phasesDone = d.stage === "qa" || finished ? PHASES : Math.max(0, stage.phase - 1);
  const gaps = counts.missing + counts.partial;
  const open = d.setItems.length;
  const nextGap = d.checks.find((c) => c.result === "missing") ?? d.checks.find((c) => c.result === "partial");
  const canFix = !sample && (nextGap !== undefined || d.setItems.length > 0);
  const fixNext = () => {
    if (nextGap) {
      const t = rowInfo[nextGap.id]?.title ?? nextGap.id;
      draftReply(`Checklist ${nextGap.id} (${t}) is ${nextGap.result}${nextGap.note ? `: ${nextGap.note}` : ""}. Let's fix it.`);
    } else if (d.setItems[0]) draftReply(`About "${d.setItems[0].item}": `);
  };
  const prdActions =
    d.prd && tab === "prd" && !finished ? (
      <div className="flex gap-2">
        <button className="btn" onClick={copyPrd}>
          {copied ? "Copied" : "Copy"}
        </button>
        <button className="btn" onClick={() => download(d.prd, `PRD-${slug(titleOf(messages))}.md`)}>
          Download .md
        </button>
      </div>
    ) : null;

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-4 border-b border-rule px-4 py-3 sm:px-6">
        <h1 className="font-serif text-xl font-semibold tracking-tight whitespace-nowrap">PRD Builder</h1>
        {started && (
          <ol className="hidden flex-1 items-center gap-1 xl:flex" aria-label="Progress">
            {STAGES.map((s, i) => {
              const at = i === stageIndex;
              const current = at && s.id !== "deliver";
              const done = i < stageIndex || (at && s.id === "deliver");
              return (
                <li
                  key={s.id}
                  aria-current={at ? "step" : undefined}
                  title={s.hint}
                  className={`flex items-center gap-1.5 text-xs ${
                    at ? "font-semibold text-ink" : s.phase > 0 ? "text-ink-soft" : "text-ink-soft/80"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`inline-flex items-center justify-center rounded-full border text-[10px] ${
                      s.phase > 0 ? "h-5 w-5" : "h-3 w-3"
                    } ${current ? "border-accent text-accent ring-2 ring-accent/30" : done ? "border-accent bg-accent text-accent-ink" : "border-rule"}`}
                  >
                    {s.phase > 0 ? (done ? "✓" : s.phase) : ""}
                  </span>
                  {s.label}
                  {done && <span className="sr-only"> (done)</span>}
                  {i < STAGES.length - 1 && <span className="mx-1 h-px w-3 bg-rule" aria-hidden />}
                </li>
              );
            })}
          </ol>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Link href="/setup" className="btn">
            Setup
          </Link>
          <button className="btn" onClick={() => setShowRuns((v) => !v)} aria-expanded={showRuns}>
            Runs{runs.length ? ` (${runs.length})` : ""}
          </button>
        </div>
      </header>

      {showRuns && (
        <div className="max-h-56 overflow-y-auto border-b border-rule bg-surface px-4 py-3 sm:px-6">
          {started && (
            <button className="btn mb-2" onClick={newRun}>
              New PRD
            </button>
          )}
          {runs.length === 0 ? (
            <p className="text-sm text-ink-soft">No saved runs yet. They save automatically in this browser.</p>
          ) : (
            <ul className="grid gap-1">
              {runs.map((r) => (
                <li key={r.id} className="flex items-center gap-3 text-sm">
                  <button className="min-h-9 flex-1 truncate text-left hover:underline" onClick={() => openRun(r)}>
                    {r.title}
                  </button>
                  <span className="text-xs text-ink-soft">{new Date(r.updatedAt).toLocaleDateString()}</span>
                  <button
                    className="link-btn text-ink-soft hover:text-missing"
                    onClick={() => deleteRun(r)}
                    aria-label={`Delete ${r.title}`}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {sample && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-rule bg-surface px-4 py-2 text-sm sm:px-6" role="note">
          <p className="min-w-0 flex-1">
            <span className="label mr-2 text-partial">Sample</span>
            Fictional content adapted from the skill’s example PRD. Read-only, not real usage.
          </p>
          <button className="link-btn text-accent underline" onClick={newRun}>
            Start your own
          </button>
        </div>
      )}

      {started && (
        <div className="flex items-center gap-3 border-b border-rule px-4 py-2 sm:px-6">
          <span className="xl:hidden">
            <PhaseDots phase={stage.phase} finished={d.stage === "qa" || d.stage === "deliver"} />
          </span>
          <p className="min-w-0 flex-1 truncate text-xs text-ink-soft" title={stage.hint}>
            <span className="label font-semibold text-ink xl:hidden">
              {stage.phase > 0 ? `Phase ${stage.phase}/${PHASES} · ` : ""}
              {stage.label}
            </span>
            <span className="xl:hidden"> </span>
            <span className="hidden sm:inline">{stage.hint}</span>
          </p>
        </div>
      )}

      {started && (
        <div
          className="flex overflow-x-auto border-b border-rule px-2 whitespace-nowrap lg:hidden"
          role="tablist"
          aria-label="Views"
        >
          {viewIds.map((id) => (
            <button
              key={id}
              id={`mtab-${id}`}
              role="tab"
              aria-selected={activeView === id}
              tabIndex={activeView === id ? 0 : -1}
              onKeyDown={(e) => onTabKey(e, viewIds, activeView, openView, "mtab")}
              onClick={() => openView(id)}
              className={`-mb-px min-h-11 shrink-0 border-b-2 px-2 text-sm ${
                activeView === id ? "border-accent font-semibold" : "border-transparent text-ink-soft"
              }`}
            >
              {id === "chat" ? "Interview" : tabLabel(id, true)}
              {id !== "chat" && changed(id) && <Dot />}
            </button>
          ))}
        </div>
      )}

      {!started ? (
        <Start
          value={input}
          onChange={setInput}
          features={features}
          sources={sources}
          onSources={setSources}
          onSample={openSample}
          onStart={() =>
            send(
              `${input.trim()}\n\n(Research: ${anySource(sources) ? [sources.web && "web", sources.academic && "academic"].filter(Boolean).join(" and ") + " on" : "off. I'll paste any evidence myself; mark the rest SET."})`,
              [],
            )
          }
        />
      ) : (
        <main className="flex min-h-0 flex-1 lg:grid lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
          <section
            className={`${pane === "chat" ? "flex" : "hidden"} min-h-0 w-full flex-col lg:flex lg:border-r lg:border-rule`}
            aria-label="Interview"
          >
            <p className="sr-only" role="status" aria-live="polite">
              {streaming ? "Claude is writing a reply." : messages.length > 1 ? "Reply ready." : ""}
            </p>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
              {messages.map((m, i) => {
                const text =
                  m.role === "assistant" ? stripTags(m.content) : m.content.replace(/\n\n\(Research:[\s\S]*\)$/, "");
                const last = i === messages.length - 1;
                if (!text && !(streaming && last)) return null;
                return m.role === "user" ? (
                  <div
                    key={i}
                    className="ml-8 rounded-lg border border-rule bg-surface px-3 py-2 text-sm whitespace-pre-wrap"
                  >
                    {text}
                  </div>
                ) : (
                  <div key={i} className="prose-chat">
                    {text && <Md text={text} />}
                    {streaming && last && (
                      <p className="flex items-center gap-2 text-xs text-ink-soft" aria-hidden>
                        <span className="dots" />
                        {d.status ?? (text ? "Writing…" : "Thinking…")}
                      </p>
                    )}
                  </div>
                );
              })}
              {errorRaw && (
                <div role="alert" className="rounded border border-missing p-3 text-sm">
                  <p className="text-missing">{friendlyError(errorRaw)}</p>
                  <div className="mt-2 flex items-center gap-3">
                    <button className="btn" onClick={retry}>
                      Retry
                    </button>
                    <details className="text-xs text-ink-soft">
                      <summary className="cursor-pointer">Technical details</summary>
                      <p className="mt-1 break-words">{errorRaw}</p>
                    </details>
                  </div>
                </div>
              )}
              <div ref={chatEnd} />
            </div>

            <div className="border-t border-rule bg-surface px-4 py-3 sm:px-6">
              {sample ? (
                <p className="text-sm text-ink-soft">
                  This is a read-only sample, so replies are off.{" "}
                  <button className="link-btn text-accent underline" onClick={newRun}>
                    Start your own
                  </button>
                </p>
              ) : (
                <>
              {d.choices.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {d.choices.map((c, i) => (
                    <button key={c} className={i === 0 ? "btn btn-primary" : "btn"} onClick={() => send(c)}>
                      {c}
                    </button>
                  ))}
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void send(input);
                }}
                className="flex items-end gap-2"
              >
                <textarea
                  ref={replyRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      void send(input);
                    }
                  }}
                  rows={2}
                  placeholder="Answer, edit, or ask…"
                  aria-label="Your reply"
                  disabled={streaming}
                  className="field min-h-[3rem] flex-1 resize-none"
                />
                {streaming ? (
                  <button type="button" className="btn" onClick={() => abortRef.current?.abort()}>
                    Stop
                  </button>
                ) : (
                  <button type="submit" className="btn btn-primary" disabled={!input.trim()}>
                    Send
                  </button>
                )}
              </form>
              <p className="mt-1.5 text-xs text-ink-soft">
                Enter to send · Shift+Enter for a new line{anySource(sources) ? " · Research on" : ""}
              </p>
                </>
              )}
            </div>
          </section>

          <section
            className={`${pane === "work" ? "flex" : "hidden"} min-h-0 w-full min-w-0 flex-col lg:flex`}
            aria-label="Workspace"
          >
            <div className="hidden items-center gap-x-1 border-b border-rule px-4 sm:px-6 lg:flex">
              <div className="flex" role="tablist" aria-label="Workspace">
                {tabIds.map((id) => (
                  <button
                    key={id}
                    id={`tab-${id}`}
                    role="tab"
                    aria-selected={tab === id}
                    aria-controls="workspace-panel"
                    tabIndex={tab === id ? 0 : -1}
                    onKeyDown={(e) => onTabKey(e, tabIds, tab, openView, "tab")}
                    onClick={() => openView(id)}
                    className={`-mb-px min-h-11 border-b-2 px-3 text-sm ${
                      tab === id ? "border-accent font-semibold" : "border-transparent text-ink-soft hover:text-ink"
                    }`}
                  >
                    {tabLabel(id, false)}
                    {changed(id) && <Dot />}
                  </button>
                ))}
              </div>
              {prdActions && <div className="ml-auto py-1.5">{prdActions}</div>}
            </div>
            {prdActions && <div className="flex justify-end border-b border-rule px-4 py-1.5 sm:px-6 lg:hidden">{prdActions}</div>}

            {(d.prd || d.checks.length > 0) && (
              <div
                className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule px-4 py-2.5 text-sm sm:px-6 ${finished ? "bg-surface" : ""}`}
                role="status"
              >
                <p className="min-w-0 flex-1">
                  {finished ? (
                    gaps + open === 0 ? (
                      <>
                        <span className="label mr-2 text-pass">Ready</span>
                        Checked, with no open gaps. Hand it to your coding agent.
                      </>
                    ) : (
                      <>
                        <span className="label mr-2 text-partial">Almost</span>
                        {gaps > 0 && `${gaps} checklist ${gaps === 1 ? "row" : "rows"}`}
                        {gaps > 0 && open > 0 && " and "}
                        {open > 0 && `${open} open ${open === 1 ? "item" : "items"}`} to close before it’s ready.
                      </>
                    )
                  ) : (
                    <span className="text-ink-soft">
                      <span className="label mr-2 text-ink">Draft</span>
                      {phasesDone} of {PHASES} phases confirmed
                      {d.checks.length > 0 && ` · ${counts.pass}/${d.checks.length} checks pass`}
                      {open > 0 && ` · ${open} need your input`}
                    </span>
                  )}
                </p>
                {finished && d.prd && (
                  <div className="flex gap-2">
                    {canFix && gaps + open > 0 ? (
                      <>
                        <button className="btn btn-primary" onClick={fixNext}>
                          Fix next gap
                        </button>
                        <button className="btn" onClick={() => download(d.prd, `PRD-${slug(titleOf(messages))}.md`)}>
                          Download .md
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="btn btn-primary"
                          onClick={() => download(d.prd, `PRD-${slug(titleOf(messages))}.md`)}
                        >
                          Download .md
                        </button>
                        <button className="btn" onClick={copyPrd}>
                          {copied ? "Copied" : "Copy"}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            <div
              id="workspace-panel"
              className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8"
              role="tabpanel"
              aria-labelledby={`${isLg ? "tab" : "mtab"}-${tab}`}
            >
              {tab === "prd" &&
                (d.prd ? (
                  <article className="prose-prd sheet">
                    {/\bSET:|proposed/i.test(d.prd) && (
                      <p className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-rule pb-3 font-sans text-xs text-ink-soft">
                        <span>
                          <SetChip /> needs your input
                        </span>
                        <span>
                          <span className="chip chip-proposed">proposed</span> a starting value you haven’t confirmed
                        </span>
                      </p>
                    )}
                    <Md text={d.prd} />
                  </article>
                ) : (
                  <Empty title="No draft yet">
                    The PRD appears here as you confirm each section, starting with Discover.
                  </Empty>
                ))}

              {tab === "checks" &&
                (d.checks.length ? (
                  <div>
                    <p className="mb-1 max-w-prose text-sm text-ink-soft">
                      The checklist is what a good PRD for an AI product must cover. Pass: covered with evidence.
                      Partial: mentioned but thin. Missing: not covered.
                    </p>
                    <p className="mb-4 text-sm">
                      <span className="text-pass">{counts.pass} pass</span> ·{" "}
                      <span className="text-partial">{counts.partial} partial</span> ·{" "}
                      <span className="text-missing">{counts.missing} missing</span>
                    </p>
                    <ul className="divide-y divide-rule border-y border-rule">
                      {[...d.checks]
                        .sort((a, b) => rank(a.result) - rank(b.result))
                        .map((c) => {
                          const info = rowInfo[c.id];
                          const title = info?.title ?? c.id;
                          return (
                            <li key={c.id} className="py-3 text-sm">
                              <p className="flex flex-wrap items-baseline gap-x-2">
                                <span className="font-mono text-xs text-ink-soft">{c.id}</span>
                                <span className="font-medium">{title}</span>
                                {info?.section && <span className="text-xs text-ink-soft">· {info.section}</span>}
                              </p>
                              <p className="mt-1 flex items-baseline gap-2">
                                <span
                                  className="w-16 shrink-0 text-xs font-semibold uppercase tracking-wide"
                                  style={{ color: `var(--${c.result})` }}
                                >
                                  {c.result}
                                </span>
                                <span className="min-w-0 flex-1 text-ink-soft">{c.note}</span>
                              </p>
                              {c.result !== "pass" && !sample && (
                                <button
                                  className="link-btn mt-1 text-accent underline"
                                  onClick={() =>
                                    draftReply(
                                      `Checklist ${c.id} (${title}) is ${c.result}${c.note ? `: ${c.note}` : ""}. Let's fix it.`,
                                    )
                                  }
                                >
                                  Fix in chat
                                </button>
                              )}
                            </li>
                          );
                        })}
                    </ul>
                  </div>
                ) : (
                  <Empty title="No report yet">
                    Every active checklist row is scored pass, partial or missing once the draft is assembled.
                  </Empty>
                ))}

              {tab === "set" &&
                (d.setItems.length ? (
                  <div>
                    <p className="mb-4 max-w-prose text-sm text-ink-soft">
                      Things only you can confirm or supply. They’re marked <SetChip /> in the draft. Answer one in the
                      chat and it drops off this list.
                    </p>
                    <ul className="grid gap-2">
                      {d.setItems.map((s) => (
                        <li
                          key={s.item}
                          className="flex items-start gap-3 rounded border border-rule bg-surface px-3 py-2 text-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">
                              <SetChip /> {s.item}
                              {s.section && <span className="ml-2 text-xs font-normal text-ink-soft">· {s.section}</span>}
                            </p>
                            {s.why && <p className="mt-0.5 text-ink-soft">{s.why}</p>}
                          </div>
                          {!sample && (
                            <button
                              className="link-btn shrink-0 text-accent underline"
                              onClick={() => draftReply(`About "${s.item}": `)}
                            >
                              Answer
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <Empty title="Nothing needs your input">
                    Items only you can confirm will be listed here as they come up.
                  </Empty>
                ))}
            </div>
          </section>
        </main>
      )}
    </div>
  );
}

function Start({
  value,
  onChange,
  onStart,
  onSample,
  features,
  sources,
  onSources,
}: {
  value: string;
  onChange: (v: string) => void;
  onStart: () => void;
  onSample: () => void;
  features: Features | null;
  sources: Sources;
  onSources: (v: Sources) => void;
}) {
  const canWeb = features?.research ?? false;
  const canAcademic = features?.academic ?? false;
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col overflow-y-auto px-4 py-10 sm:px-6 [&>*]:shrink-0">
      <h2 className="mt-auto font-serif text-3xl leading-tight font-semibold sm:text-4xl">
        Write a PRD that an AI agent can follow.
      </h2>
      <p className="mt-3 max-w-prose text-ink-soft">
        A PRD (product requirements document) says what to build and why. Describe your product idea, or paste a PRD
        you already have, and you’ll be walked through it one phase at a time.
      </p>

      <ol className="mt-6 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2" aria-label="How it works">
        {[
          ["Describe", "Your idea, in a few lines."],
          ["Answer", "A few questions per phase: Discover, Design, Develop, Deploy."],
          ["Confirm", "Review each draft section and approve or edit it."],
          ["Download", "A PRD checked against a checklist, with gaps clearly marked."],
        ].map(([t, d], i) => (
          <li key={t} className="flex gap-3">
            <span
              aria-hidden
              className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-ink-soft text-[10px]"
            >
              {i + 1}
            </span>
            <span>
              <span className="font-semibold">{t}.</span> <span className="text-ink-soft">{d}</span>
            </span>
          </li>
        ))}
      </ol>

      {features && !features.anthropic && (
        <p role="status" className="mt-6 rounded border border-partial p-3 text-sm">
          <span className="font-semibold">No API key on this copy of the app,</span> so a live interview can’t start.
          You can still explore a finished sample run, or{" "}
          <Link href="/setup" className="text-accent underline">
            set up your keys
          </Link>
          .{" "}
          <button className="link-btn text-accent underline" onClick={onSample}>
            Open the sample
          </button>
        </p>
      )}

      <label htmlFor="idea" className="mt-8 text-sm font-semibold">
        Your product idea or existing PRD
      </label>
      <textarea
        id="idea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={7}
        placeholder="What does it do, for whom, and where does AI come in?"
        className="field mt-2 min-h-36"
      />
      {!value.trim() && (
        <button className="link-btn mt-1 self-start text-accent underline" onClick={() => onChange(SAMPLE_IDEA)}>
          Try an example idea
        </button>
      )}

      <fieldset className="mt-4 space-y-3">
        <legend className="sr-only">Research sources</legend>
        <label className={`flex items-start gap-3 text-sm ${canWeb ? "" : "opacity-80"}`}>
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
            checked={sources.web && canWeb}
            disabled={!canWeb}
            onChange={(e) => onSources({ ...sources, web: e.target.checked })}
          />
          <span>
            <span className="font-semibold">Web research</span>
            <span className="block text-ink-soft">
              {canWeb ? (
                "Searches the web and reads pages for why-now, competitors and facts, and cites them with dates."
              ) : features ? (
                <>
                  Needs a Tavily key. Without it you paste evidence yourself.{" "}
                  <Link href="/setup" className="text-accent underline">
                    How to add a key
                  </Link>
                </>
              ) : (
                "Checking…"
              )}
            </span>
          </span>
        </label>
        <label className={`flex items-start gap-3 text-sm ${canAcademic ? "" : "opacity-80"}`}>
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
            checked={sources.academic && canAcademic}
            disabled={!canAcademic}
            onChange={(e) => onSources({ ...sources, academic: e.target.checked })}
          />
          <span>
            <span className="font-semibold">Academic research</span>
            <span className="block text-ink-soft">
              {features
                ? "Finds scholarly papers (OpenAlex, and Semantic Scholar with a key) and explains what each finding means for your PRD and how strong the evidence is. Works without a key, within a small shared daily limit."
                : "Checking…"}
            </span>
          </span>
        </label>
      </fieldset>

      <div className="mt-6 mb-auto flex flex-wrap items-center gap-3">
        <button
          className={`btn whitespace-nowrap ${features?.anthropic === false ? "" : "btn-primary"}`}
          disabled={value.trim().length < 10 || features?.anthropic === false}
          onClick={onStart}
        >
          Start interview
        </button>
        <button className={`btn whitespace-nowrap ${features?.anthropic === false ? "btn-primary" : ""}`} onClick={onSample}>
          View a sample run
        </button>
      </div>
    </main>
  );
}

function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="max-w-prose">
      <p className="font-serif text-lg font-semibold">{title}</p>
      <p className="mt-1 text-sm text-ink-soft">{children}</p>
    </div>
  );
}

const rank = (r: string) => (r === "missing" ? 0 : r === "partial" ? 1 : 2);
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "product";

function download(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
