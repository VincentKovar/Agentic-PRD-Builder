# Progress

Last updated: 2026-10-26 (later)

## Done

- **Scaffold:** Next.js 16 (App Router, TypeScript, Tailwind v4). Runs locally; no database.
- **Skill as system prompt:** `skill/` is a copy of [ai-prd-builder](https://github.com/VincentKovar/ai-prd-builder) (SKILL.md, config.md, references). `data/checklist.md` is re-read on every request.
- **Claude API route:** `src/app/api/chat/route.ts` streams replies (default model `claude-sonnet-5-5`, override with `ANTHROPIC_MODEL`) and runs the tool-use loop.
- **Tag protocol:** the model emits `<stage>`, `<prd>`, `<checks>`, `<set>`, `<choices>` (and the server emits `<status>`, `<error>`). `src/lib/parse.ts` turns them into the stepper, live PRD preview, checklist table, SET list and confirm buttons.
- **UI:** start screen, interview chat, PRD / Checklist / SET tabs, copy and download `.md`, runs saved in browser localStorage, mobile Interview/PRD toggle.
- **Web research (Tavily):** `web_search` and `web_extract` tools in `src/lib/tavily.ts`; caps of 8 searches and 6 page opens per request; toggle on the start screen, enabled when `TAVILY_API_KEY` is set.
- **Impeccable:** installed per project (`npx impeccable install --project --providers=claude --no-hooks`), telemetry off, `PRODUCT.md` written by hand following its init flow. The UI was checked with `impeccable detect` and is clean.

- **Design pass:** audience set to AI builders, with the app also serving as a portfolio piece (`PRODUCT.md`). Type is Schibsted Grotesk, IBM Plex Mono and Newsreader. The PRD renders as a paper sheet. A summary strip shows Draft/Almost/Ready, with "Fix next gap" as the one primary action at Finish.
- **Sample run:** a read-only, labelled sample run (`src/lib/sample.ts`) is available from the start screen, so visitors without a key can see the whole flow.
- **Critique trend:** 22 -> 25 -> 26 / 40 (`.impeccable/critique/`).

## Verified

- `tsc --noEmit` and `eslint` pass.
- UI flow checked in the browser at desktop and mobile widths against a mocked streaming reply (tags, status lines, choices, saved runs, pane toggle).
- API route returns clear errors when keys are missing.

## Not verified

- No real Claude call has been made (no `ANTHROPIC_API_KEY` yet), so the interview quality, tag compliance and PRD output are untested.
- No real Tavily call has been made; request shapes follow the Tavily docs for `/search` and `/extract`.

## Not built yet

- Writing approved checklist rows back to `data/checklist.md` and the changelog (CP5).
- Research caps are per request, not per run.
- Raw search results are not kept between turns; sources survive only in the model's text and the PRD.
- Runs are per-browser (localStorage). No auth or hosting.
- Impeccable live mode is not configured; `/impeccable` commands need a fresh Claude Code session to load the skill.

## Notes

- If the dev server serves stale CSS, restart it with `rm -rf .next && npm run dev`.
- `.claude/skills/impeccable` is not committed (19 MB, includes a platform binary). Reinstall with `npx impeccable install --project --providers=claude --no-hooks`.
- Impeccable was installed from its npm package, not from the `VincentKovar/impeccable` fork.
