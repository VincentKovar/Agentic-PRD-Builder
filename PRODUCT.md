# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js (App Router, TypeScript, Tailwind) with Route Handlers calling the Claude API. Runs locally with the user's own `ANTHROPIC_API_KEY` in `.env.local`. No database; PRDs and the checklist are plain files and browser storage.

## Users

Primary: AI builders at the leading edge: engineers, AI product managers and founders who ship agents and LLM products and write PRDs that both people and coding agents must follow. They are fluent with agents, tool use and evals, but new to this specific workflow and checklist. They read the interface the way they read a good developer tool: quickly, skeptically, and for craft.

Secondary: hiring managers and peers who see this as a work sample of the owner's AI product and engineering judgment. They may open it with no API key, in a few minutes, and judge it by how clearly it shows the thinking behind it.

## Product Purpose

A front end for the `ai-prd-builder` skill. It runs the skill's phase-by-phase interview (Discover, Design, Develop, Deploy), writes a complete `PRD.md`, and checks it against the living checklist. Success is one checked PRD that a person can read in sections 1 and 2 and a coding agent can follow after that. A second purpose is to demonstrate, in the product itself, how the owner designs agentic software.

## Positioning

Unlike chatting with the skill in Claude, the app shows the PRD draft and the checklist status updating live, turns the skill's checkpoints into explicit confirm/edit steps, tracks the SET items only the user can fill, and saves runs so they can be resumed. The engineering is legible: the skill is the system prompt, a small tag protocol drives the UI, research runs through capped tool calls, and unknowns are marked rather than invented.

## Operating Context

- The skill's SKILL.md, references and config are the system prompt; `data/checklist.md` is re-read on every request because the user edits it between runs.
- Every checkpoint waits for the user. Nothing is written to the checklist without approval.
- Local only for now: single user, no auth, no hosting. The repo is meant to be pointed to in job applications, so the README and the first minute without a key matter.

## Capabilities and Constraints

- Live PRD preview, checklist pass/partial/missing table, SET list, phase stepper, saved runs, Finish summary.
- Optional research: web (Tavily search and page extract) and academic (OpenAlex semantic and keyword search, Semantic Scholar keyword search), all capped. Findings are shown with a plain-language interpretation (what it says, what it means for this PRD, how strong the evidence is), always labelled as the model's interpretation. Without a key the user pastes evidence and gaps are marked SET.
- Never invent facts, numbers, quotes or competitors; unknowns are tagged SET and starting numbers are labelled proposed.
- Undecided: a no-key sample run for visitors; writing approved rows back to `data/checklist.md`; hosted multi-user mode; making the repository public.

## Evidence on Hand

The skill's own files (`skill/`), the starter checklist (`data/checklist.md`, 31 rows), and Impeccable critique snapshots in `.impeccable/critique/`. No user research or usage data exists; do not fabricate any, and do not present sample content as real usage.

## Product Principles

1. The user confirms; the app never advances past a checkpoint on its own.
2. Gaps stay visible. A SET item or a failing row is shown, never hidden.
3. Define workflow terms briefly on first use; assume fluency with agents, not with this checklist.
4. The PRD is the product: it is always one click from view, copy or download.
5. Show the work. The mechanics (what ran, what was assumed, what is unverified) should be inspectable, not hidden behind polish.

## Accessibility & Inclusion

Keyboard-operable tabs and controls, visible focus, 4.5:1 text contrast, reduced-motion respected, status never carried by colour alone.
