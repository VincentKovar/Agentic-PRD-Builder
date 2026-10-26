"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { STAGES, derive, extract, stripTags, type Msg } from "@/lib/parse";

type Run = { id: string; title: string; messages: Msg[]; updatedAt: number; research?: boolean };
type Tab = "prd" | "checks" | "set";
type Pane = "chat" | "work";
type Features = { anthropic: boolean; research: boolean };

const STORE = "prd-builder-runs";

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
  const [showRuns, setShowRuns] = useState(false);
  const [copied, setCopied] = useState(false);
  const [features, setFeatures] = useState<Features | null>(null);
  const [research, setResearch] = useState(false);
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
        setResearch(f.research);
      })
      .catch(() => setFeatures({ anthropic: false, research: false }));
  }, []);

  const d = useMemo(() => derive(messages, streaming), [messages, streaming]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  useEffect(() => {
    if (!streaming && messages.length > 0) replyRef.current?.focus({ preventScroll: true });
  }, [streaming, messages.length]);

  const persist = useCallback((id: string, msgs: Msg[], withResearch: boolean) => {
    setRuns((prev) => {
      const next = [
        { id, title: titleOf(msgs), messages: msgs, updatedAt: Date.now(), research: withResearch },
        ...prev.filter((r) => r.id !== id),
      ];
      saveRuns(next);
      return next;
    });
  }, []);

  const send = useCallback(
    async (text: string, base: Msg[] = messages) => {
      const content = text.trim();
      if (!content || streaming) return;
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
          body: JSON.stringify({ messages: history, research }),
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
        persist(id, final, research);
      }
    },
    [messages, streaming, runId, research, persist],
  );

  const openRun = (r: Run) => {
    setRunId(r.id);
    setMessages(r.messages);
    if (r.research !== undefined) setResearch(r.research && (features?.research ?? false));
    setShowRuns(false);
    setNetError(null);
    setPane("chat");
  };

  const newRun = () => {
    abortRef.current?.abort();
    setRunId(null);
    setMessages([]);
    setInput("");
    setShowRuns(false);
    setNetError(null);
    setPane("chat");
    setResearch(features?.research ?? false);
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

  const stageIndex = STAGES.findIndex((s) => s.id === d.stage);
  const started = messages.length > 0;
  const counts = {
    pass: d.checks.filter((c) => c.result === "pass").length,
    partial: d.checks.filter((c) => c.result === "partial").length,
    missing: d.checks.filter((c) => c.result === "missing").length,
  };

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-4 border-b border-rule px-4 py-3 sm:px-6">
        <h1 className="font-serif text-xl font-semibold tracking-tight">PRD Builder</h1>
        {started && (
          <ol className="hidden flex-1 items-center gap-1 md:flex" aria-label="Progress">
            {STAGES.map((s, i) => (
              <li
                key={s.id}
                aria-current={i === stageIndex ? "step" : undefined}
                className={`flex items-center gap-1 text-xs ${
                  i === stageIndex ? "font-semibold text-ink" : "text-ink-soft"
                }`}
              >
                <span
                  className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${
                    i === stageIndex
                      ? "border-accent bg-accent text-accent-ink"
                      : i < stageIndex
                        ? "border-ink-soft"
                        : "border-rule"
                  }`}
                >
                  {i < stageIndex ? "✓" : i + 1}
                </span>
                {s.label}
                {i < STAGES.length - 1 && <span className="mx-1 h-px w-4 bg-rule" aria-hidden />}
              </li>
            ))}
          </ol>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button className="btn" onClick={() => setShowRuns((v) => !v)} aria-expanded={showRuns}>
            Runs{runs.length ? ` (${runs.length})` : ""}
          </button>
          {started && (
            <button className="btn" onClick={newRun}>
              New PRD
            </button>
          )}
        </div>
      </header>

      {showRuns && (
        <div className="max-h-56 overflow-y-auto border-b border-rule bg-surface px-4 py-3 sm:px-6">
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
                    className="min-h-9 px-1 text-xs text-ink-soft hover:text-missing"
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

      {started && (
        <div className="flex items-center gap-3 border-b border-rule px-4 py-2 md:hidden">
          <p className="text-xs text-ink-soft">
            Step {stageIndex + 1} of {STAGES.length} ·{" "}
            <span className="font-semibold text-ink">{STAGES[stageIndex].label}</span>
          </p>
          <div className="ml-auto flex rounded border border-rule text-xs lg:hidden" role="group" aria-label="View">
            {(
              [
                ["chat", "Interview"],
                ["work", "PRD"],
              ] as [Pane, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                aria-pressed={pane === id}
                onClick={() => setPane(id)}
                className={`px-3 py-1.5 ${pane === id ? "bg-ink text-paper" : "text-ink-soft"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {!started ? (
        <Start
          value={input}
          onChange={setInput}
          features={features}
          research={research}
          onResearch={setResearch}
          onStart={() =>
            send(
              `${input.trim()}\n\n(Research: ${research ? "on" : "off. I'll paste any evidence myself; mark the rest SET."})`,
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
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6" aria-live="polite">
              {messages.map((m, i) => {
                const text = m.role === "assistant" ? stripTags(m.content) : m.content.replace(/\n\n\(Research:[\s\S]*\)$/, "");
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
                    {text && <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>}
                    {streaming && last && (
                      <p className="flex items-center gap-2 text-xs text-ink-soft" role="status">
                        <span className="dots" aria-hidden />
                        {d.status ?? (text ? "Writing…" : "Thinking…")}
                      </p>
                    )}
                  </div>
                );
              })}
              {(netError || d.error) && (
                <div role="alert" className="rounded border border-missing p-3 text-sm text-missing">
                  {netError ?? d.error}
                  <button className="ml-3 underline" onClick={retry}>
                    Retry
                  </button>
                </div>
              )}
              <div ref={chatEnd} />
            </div>

            <div className="border-t border-rule bg-surface px-4 py-3 sm:px-6">
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
              <p className="mt-1.5 text-[11px] text-ink-soft">
                Enter to send · Shift+Enter for a new line{research ? " · Research on" : ""}
              </p>
            </div>
          </section>

          <section
            className={`${pane === "work" ? "flex" : "hidden"} min-h-0 w-full min-w-0 flex-col lg:flex`}
            aria-label="Workspace"
          >
            <div className="flex flex-wrap items-center gap-x-1 border-b border-rule px-4 sm:px-6" role="tablist">
              {(
                [
                  ["prd", "PRD"],
                  ["checks", d.checks.length ? `Checklist ${counts.pass}/${d.checks.length}` : "Checklist"],
                  ["set", `SET items${d.setItems.length ? ` (${d.setItems.length})` : ""}`],
                ] as [Tab, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={`-mb-px border-b-2 px-3 py-2.5 text-sm ${
                    tab === id ? "border-accent font-semibold" : "border-transparent text-ink-soft hover:text-ink"
                  }`}
                >
                  {label}
                </button>
              ))}
              {d.prd && (
                <div className="ml-auto flex gap-2 py-1.5">
                  <button className="btn" onClick={copyPrd}>
                    {copied ? "Copied" : "Copy"}
                  </button>
                  <button className="btn" onClick={() => download(d.prd, `PRD-${slug(titleOf(messages))}.md`)}>
                    Download .md
                  </button>
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8" role="tabpanel">
              {tab === "prd" &&
                (d.prd ? (
                  <article className="prose-prd">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{d.prd}</ReactMarkdown>
                  </article>
                ) : (
                  <Empty title="No draft yet">
                    The PRD appears here as you confirm each section, starting with Discover.
                  </Empty>
                ))}

              {tab === "checks" &&
                (d.checks.length ? (
                  <div>
                    <p className="mb-4 text-sm text-ink-soft">
                      <span className="text-pass">{counts.pass} pass</span> ·{" "}
                      <span className="text-partial">{counts.partial} partial</span> ·{" "}
                      <span className="text-missing">{counts.missing} missing</span>
                    </p>
                    <ul className="divide-y divide-rule border-y border-rule">
                      {[...d.checks]
                        .sort((a, b) => rank(a.result) - rank(b.result))
                        .map((c) => (
                          <li key={c.id} className="flex flex-wrap gap-x-3 gap-y-1 py-2.5 text-sm">
                            <span className="w-10 shrink-0 font-mono text-xs text-ink-soft">{c.id}</span>
                            <span
                              className="w-16 shrink-0 text-xs font-semibold uppercase tracking-wide"
                              style={{ color: `var(--${c.result})` }}
                            >
                              {c.result}
                            </span>
                            <span className="min-w-0 flex-1 basis-48 text-ink-soft">{c.note}</span>
                          </li>
                        ))}
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
                      Only you can confirm these or supply the evidence. Answer one in the chat and it drops off the
                      list.
                    </p>
                    <ul className="grid gap-2">
                      {d.setItems.map((s) => (
                        <li
                          key={s}
                          className="flex items-start gap-3 rounded border border-rule bg-surface px-3 py-2 text-sm"
                        >
                          <span className="flex-1">{s.replace(/^SET:\s*/i, "")}</span>
                          <button
                            className="min-h-6 shrink-0 text-xs text-accent underline"
                            onClick={() => {
                              setInput(`About "${s.replace(/^SET:\s*/i, "")}": `);
                              setPane("chat");
                              replyRef.current?.focus();
                            }}
                          >
                            Answer
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <Empty title="Nothing open">Items only you can confirm will be listed here as they come up.</Empty>
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
  features,
  research,
  onResearch,
}: {
  value: string;
  onChange: (v: string) => void;
  onStart: () => void;
  features: Features | null;
  research: boolean;
  onResearch: (v: boolean) => void;
}) {
  const canResearch = features?.research ?? false;
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center overflow-y-auto px-4 py-10 sm:px-6">
      <h2 className="font-serif text-3xl leading-tight font-semibold sm:text-4xl">
        Write a PRD that an AI agent can follow.
      </h2>
      <p className="mt-3 max-w-prose text-ink-soft">
        Describe the product you want to build, or paste a PRD you already have. You’ll answer a few questions per
        section, confirm each draft, and get a PRD checked against your living checklist.
      </p>

      {features && !features.anthropic && (
        <p role="status" className="mt-6 rounded border border-partial p-3 text-sm">
          <span className="font-semibold">No API key yet.</span> Add <code className="font-mono">ANTHROPIC_API_KEY</code>{" "}
          to <code className="font-mono">.env.local</code> and restart the dev server to start an interview.
        </p>
      )}

      <label htmlFor="idea" className="mt-8 text-sm font-semibold">
        Your product idea or existing PRD
      </label>
      <textarea
        id="idea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={8}
        placeholder="e.g. An agent that reviews vendor contracts for a legal team and flags clauses that need a lawyer."
        className="field mt-2"
      />

      <label className={`mt-4 flex items-start gap-3 text-sm ${canResearch ? "" : "opacity-80"}`}>
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
          checked={research && canResearch}
          disabled={!canResearch}
          onChange={(e) => onResearch(e.target.checked)}
        />
        <span>
          <span className="font-semibold">Web research</span>
          <span className="block text-ink-soft">
            {canResearch
              ? "Searches and reads pages for why-now, problem evidence and competitors, with sources and dates. Your idea text is not sent to the search tool; only focused queries are."
              : features
                ? "Off. Add TAVILY_API_KEY to .env.local to enable it. Until then, paste evidence as you go and gaps are marked SET."
                : "Checking…"}
          </span>
        </span>
      </label>

      <div className="mt-6">
        <button
          className="btn btn-primary whitespace-nowrap"
          disabled={value.trim().length < 10 || features?.anthropic === false}
          onClick={onStart}
        >
          Start interview
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
