# PRD Builder (web)

A front end for the [`ai-prd-builder`](https://github.com/VincentKovar/ai-prd-builder) skill. The skill's files are the system prompt; the Claude API runs the interview.

## Run

```bash
cp .env.local.example .env.local   # then add ANTHROPIC_API_KEY (and TAVILY_API_KEY for web research)
npm install
npm run dev                        # http://localhost:3000
```

## Layout

- `skill/` – copy of the skill (SKILL.md, config.md, references/). Re-copy to update.
- `data/checklist.md` – the living checklist, re-read on every request. Edit by hand; never delete rows, retire them.
- `src/lib/prompt.ts` – builds the system prompt and the web-app adapter (tag protocol).
- `src/app/api/chat/route.ts` – streams the model's reply.
- `src/lib/tavily.ts` – Tavily search/extract tools. The route runs the model's tool-use loop (caps: 8 searches, 6 page opens per request).
- `src/lib/parse.ts` – reads `<stage>`, `<prd>`, `<checks>`, `<set>`, `<choices>` tags out of replies.
- `src/components/Builder.tsx` – the UI. Runs are saved in browser localStorage.
- `PRODUCT.md` – Impeccable product context. Design commands: `/impeccable critique`, `audit`, `polish`.

## Not built yet

Research needs `TAVILY_API_KEY`; without it the toggle is disabled and gaps are marked SET. Approved checklist rows are not written back to `data/checklist.md`. Runs are per-browser only.
