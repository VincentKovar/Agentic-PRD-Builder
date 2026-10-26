"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Status = { anthropic: boolean; research: boolean } | null;
type Test = { state: "idle" | "running" | "done"; ok?: boolean; message?: string };

function Code({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="my-2 flex items-start gap-2 rounded border border-rule bg-surface">
      <pre className="min-w-0 flex-1 overflow-x-auto px-3 py-2 font-mono text-xs leading-relaxed">{children}</pre>
      <button
        className="link-btn m-1 shrink-0 text-accent underline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(children);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard blocked */
          }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent underline">
      {children}
    </a>
  );
}

function Provider({
  name,
  required,
  found,
  testing,
  onTest,
  test,
  children,
}: {
  name: string;
  required: boolean;
  found: boolean | null;
  testing: string;
  onTest: () => void;
  test: Test;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8 rounded border border-rule p-4 sm:p-5" aria-label={name}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="font-serif text-xl font-semibold">{name}</h2>
        <span className="label text-ink-soft">{required ? "Required" : "Optional"}</span>
        <span
          className={`label ml-auto ${found === null ? "text-ink-soft" : found ? "text-pass" : "text-partial"}`}
        >
          {found === null ? "Checking…" : found ? "Key found" : "Key not set"}
        </span>
      </div>
      <div className="mt-3 space-y-3 text-sm">{children}</div>
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-rule pt-3">
        <button className="btn" onClick={onTest} disabled={test.state === "running" || found === false}>
          {test.state === "running" ? "Testing…" : "Test connection"}
        </button>
        <span className="text-xs text-ink-soft">{testing}</span>
        {test.state === "done" && (
          <p role="status" className={`w-full text-sm ${test.ok ? "text-pass" : "text-missing"}`}>
            {test.message}
          </p>
        )}
      </div>
    </section>
  );
}

export default function Setup() {
  const [status, setStatus] = useState<Status>(null);
  const [tests, setTests] = useState<Record<string, Test>>({ anthropic: { state: "idle" }, tavily: { state: "idle" } });

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ anthropic: false, research: false }));
  }, []);

  const runTest = async (provider: "anthropic" | "tavily") => {
    setTests((t) => ({ ...t, [provider]: { state: "running" } }));
    try {
      const res = await fetch("/api/setup/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const j = (await res.json()) as { ok: boolean; message: string };
      setTests((t) => ({ ...t, [provider]: { state: "done", ok: j.ok, message: j.message } }));
    } catch {
      setTests((t) => ({
        ...t,
        [provider]: { state: "done", ok: false, message: "Couldn't reach this app's server. Is it still running?" },
      }));
    }
  };

  return (
    <div className="min-h-dvh">
      <header className="flex items-center gap-4 border-b border-rule px-4 py-3 sm:px-6">
        <h1 className="font-serif text-xl font-semibold tracking-tight whitespace-nowrap">PRD Builder</h1>
        <Link href="/" className="btn ml-auto">
          Back to the app
        </Link>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <h2 className="font-serif text-3xl leading-tight font-semibold sm:text-4xl">Set up your API keys</h2>
        <p className="mt-3 max-w-prose text-ink-soft">
          This app talks to two services using keys that you own. A key is a long secret string that works like a
          password and may be billed to you. Keys live on the computer that runs this app, never in your browser.
        </p>

        <Provider
          name="Anthropic (Claude)"
          required
          found={status ? status.anthropic : null}
          testing="Free: this check only lists models."
          onTest={() => runTest("anthropic")}
          test={tests.anthropic}
        >
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              Sign in or create an account at the <Ext href="https://platform.claude.com/">Claude Console</Ext>.
            </li>
            <li>
              Add credit on the <Ext href="https://platform.claude.com/settings/billing">Billing page</Ext> and check
              your monthly spend limit there. Start small: an interview uses a modest amount.
            </li>
            <li>
              Create a <Ext href="https://platform.claude.com/settings/workspaces">workspace</Ext> just for this
              project. Workspaces let you control spend per project, and a key created inside one works without any
              extra setup.
            </li>
            <li>
              Open the <Ext href="https://platform.claude.com/settings/keys">API keys page</Ext>, create a key in that
              workspace, give it a name like “prd-builder”, and choose a short expiration. You see the key once, so
              copy it now.
            </li>
            <li>Put it in the file described below. Don’t paste it anywhere else.</li>
          </ol>
        </Provider>

        <Provider
          name="Tavily (web research)"
          required={false}
          found={status ? status.research : null}
          testing="Uses 1 search credit."
          onTest={() => runTest("tavily")}
          test={tests.tavily}
        >
          <p className="text-ink-soft">
            Lets the interview search the web and read pages for evidence and competitors, with sources and dates.
            Skip it and the app still works: you paste evidence yourself and gaps are marked for you.
          </p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              Sign up at <Ext href="https://app.tavily.com">app.tavily.com</Ext>. Tavily advertises a free plan with
              monthly credits and no card; check their pricing page for the current allowance.
            </li>
            <li>
              Copy your key from the dashboard. Tavily keys start with <code className="font-mono">tvly-</code>.
            </li>
            <li>Put it in the file described below.</li>
          </ol>
        </Provider>

        <section className="mt-8" aria-label="Add the keys">
          <h2 className="font-serif text-xl font-semibold">Add them to the app</h2>
          <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm">
            <li>
              In the project folder, make your private copy of the settings file:
              <Code>cp .env.local.example .env.local</Code>
            </li>
            <li>
              Open <code className="font-mono">.env.local</code> and paste each key after its equals sign, with no
              quotes and no spaces:
              <Code>{`ANTHROPIC_API_KEY=sk-ant-…\nTAVILY_API_KEY=tvly-…`}</Code>
            </li>
            <li>
              Restart the app so it picks them up: stop it with Ctrl+C, then
              <Code>npm run dev</Code>
            </li>
            <li>Come back here and press Test connection.</li>
          </ol>
        </section>

        <section className="mt-10" aria-label="Keep your keys safe">
          <h2 className="font-serif text-xl font-semibold">Keep your keys safe</h2>
          <ul className="mt-3 list-disc space-y-3 pl-5 text-sm">
            <li>
              <span className="font-semibold">One place only.</span> A key belongs in{" "}
              <code className="font-mono">.env.local</code> on the machine running the app. Never put it in chat, in
              this app’s text boxes, in screenshots, in issues, in commits, or in source code. Don’t paste it to an AI
              assistant either.
            </li>
            <li>
              <span className="font-semibold">Never in the browser.</span> Don’t add a{" "}
              <code className="font-mono">NEXT_PUBLIC_</code> prefix to a key name: that publishes it to every visitor.
            </li>
            <li>
              <span className="font-semibold">Check it can’t be committed.</span> This should print the file name:
              <Code>git check-ignore .env.local</Code>
              If it prints nothing, stop and fix <code className="font-mono">.gitignore</code> before committing.
            </li>
            <li>
              <span className="font-semibold">Limit the damage.</span> Use a separate key and workspace per project,
              set a monthly spend limit, pick a short expiration, and glance at usage now and then.
            </li>
            <li>
              <span className="font-semibold">If a key leaks, revoke first.</span> Delete it in the provider’s
              dashboard right away, create a new one, update <code className="font-mono">.env.local</code>, restart, and
              check usage for charges you don’t recognise. Deleting a file from git history does not make a leaked key
              safe again.
            </li>
            <li>
              <span className="font-semibold">Don’t deploy it with your keys.</span> This app has no login, so anyone
              who can open a deployed copy could spend your credits. On a host, keys go in its environment-variable
              settings, never in the repo. Add sign-in and rate limits first, or leave the keys off and let visitors use
              the sample run. Connection tests are switched off on deployed copies for the same reason.
            </li>
            <li>
              <span className="font-semibold">Know what leaves your machine.</span> Your messages and the PRD text go to
              Anthropic. Short search queries go to Tavily. Don’t enter confidential material you wouldn’t send to those
              services.
            </li>
            <li>
              <span className="font-semibold">Shared or synced folders.</span> Keep the project out of folders that sync
              to shared drives, and don’t share your screen with the file open.
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
