# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js (App Router, TypeScript, Tailwind) with Route Handlers calling the Claude API. Runs locally with the user's own `ANTHROPIC_API_KEY` in `.env.local`. No database; PRDs and the checklist are plain files and browser storage.

## Users

Product managers and founders writing PRDs for products that use AI or agents. Many are new to agents and need defaults, plain-language definitions and a checklist that catches gaps they would not think to look for. They are working through one PRD at a time, often over several sittings.

## Product Purpose

A front end for the `ai-prd-builder` skill. It runs the skill's section-by-section interview (Discover, Design, Develop, Deploy), writes a complete `PRD.md`, and checks it against the living checklist. Success is one checked PRD that a person can read in sections 1 and 2 and a coding agent can follow after that.

## Positioning

Unlike chatting with the skill in Claude, the app shows the PRD draft and the checklist status updating live, turns the skill's checkpoints into explicit confirm/edit steps, tracks the SET items only the user can fill, and saves runs so they can be resumed.

## Operating Context

- The skill's SKILL.md, references and config are the system prompt; `data/checklist.md` is re-read on every request because the user edits it between runs.
- Every checkpoint waits for the user. Nothing is written to the checklist without approval.
- Local only for now: single user, no auth, no hosting.

## Capabilities and Constraints

- Live PRD preview, checklist pass/partial/missing table, SET list, stage stepper, saved runs.
- No web research in v1 (the skill's fallback applies: the user pastes evidence or the item is marked SET).
- Never invent facts, numbers, quotes or competitors; unknowns are tagged SET and starting numbers are labelled proposed.
- Undecided: writing approved rows back to `data/checklist.md`; hosted multi-user mode; feedback-log handling.

## Evidence on Hand

The skill's own files (`skill/`) and the starter checklist (`data/checklist.md`, 31 rows). No user research or usage data exists yet; do not fabricate any.

## Product Principles

1. The user confirms; the app never advances past a checkpoint on its own.
2. Gaps stay visible. A SET item or a failing row is shown, never hidden.
3. Explain terms on first use; assume the reader is new to agents.
4. The PRD is the product: it is always one click from view, copy or download.
