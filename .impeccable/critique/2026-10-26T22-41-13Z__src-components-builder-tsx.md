---
target: src/components/Builder.tsx (PRD Builder UI)
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/Users/vincentkovar/Projects/ai-prd-builder-web/src/components/Builder.tsx"
target_fingerprint: "sha256:8d42784df2a31f19df8c967e13488524505400dc755d4896c6c54c5b8f3d771b"
target_path: /Users/vincentkovar/Projects/ai-prd-builder-web/src/components/Builder.tsx
timestamp: 2026-10-26T22-41-13Z
slug: src-components-builder-tsx
---
Method: dual-agent (A: design-review sub-agent · B: detector sub-agent)

## Design Health Score: 22/40 (Acceptable)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | No cue on mobile when checklist/SET change |
| 2 | Match System / Real World | 2 | SET, Intake, Check undefined; C01 IDs meaningless |
| 3 | User Control and Freedom | 2 | No undo of Confirm; no jump to earlier stage |
| 4 | Consistency and Standards | 3 | Copy/Download on tabs they do not act on |
| 5 | Error Prevention | 2 | Confirm commits with no preview; Enter sends in textarea |
| 6 | Recognition Rather Than Recall | 2 | Checklist rows lack criterion text |
| 7 | Flexibility and Efficiency | 2 | No shortcuts; no batch SET answers |
| 8 | Aesthetic and Minimalist Design | 3 | Sparse Checklist tab; dead space at 1440px |
| 9 | Error Recovery | 2 | Raw error text; dev-oriented no-key fix |
| 10 | Help and Documentation | 1 | No definitions despite PRODUCT.md principle 3 |

## Design Specificity Verdict
Mostly generic: serif headline over pale blue-grey page with rust accent could be any AI notes tool. Serif PRD next to sans chat is the one specific idea and is not carried into the chrome. Detector: src scan 0, URL scan 0, in-page overlay on interview view 2 (tiny-text 11px at src/components/Builder.tsx:382; overused-font Geist 91%). Geist flag corroborates the generic verdict.

## Priority Issues
1. [P1] PRD/Checklist/SET unreachable at ~768-1023px (md:hidden bar, lg:hidden toggle, lg workspace). Fix: show toggle below lg. Command: adapt
2. [P1] Checklist rows and SET items lack criterion title, why, section link. Command: clarify
3. [P1] No definitions for first-timers; 7-step stepper vs 4-phase model; API-key wording. Command: onboard
4. [P2] Confirm and Deliver undesigned: no commit caption, no completion panel. Command: delight
5. [P2] Generic identity; carry document metaphor into chrome; replace Geist. Command: bolder, typeset

## Persona Red Flags
Alex: no shortcuts, one-at-a-time SET answers, no row-to-section jump. Jordan: unexplained SET/Check, .env.local banner. Sam: tabs lack arrow keys/aria-controls, aria-live on whole chat, low-contrast amber 12px, 24px Answer target. Casey: nested nav layers, no PRD badge, silent pane switch.

## Minor Observations
Runs panel pushes page down and shows no stage; dark mode hue shift; wordmark wraps at ~900px; bare URL citations; research checkbox ambiguous; weak Retry emphasis.

## Questions to Consider
PRD as main canvas with narrow interview rail? Confirmed section as a stamp? Checklist as inline annotations?
