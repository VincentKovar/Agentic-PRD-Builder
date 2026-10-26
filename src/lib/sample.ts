import type { Msg } from "@/lib/parse";

/**
 * A finished, read-only run for visitors without an API key.
 * Adapted from the example PRD in the ai-prd-builder skill (skill/references/example-prd.md), trimmed
 * and made vendor-neutral. It is fictional sample content, never real usage or research.
 */

const IDEA =
  "An agent that reviews vendor contracts for in-house legal teams, drafts a redline for a lawyer to approve, and after signing extracts the key commercial terms for finance and sales systems.";

const HEADER = `# PRD.md: Contract Risk and Monetization Agent (sample)

Sample excerpt adapted from the example PRD in the ai-prd-builder skill. Fictional content, not real research. Numbers marked proposed are starting values; items marked SET need the user's confirmation.

## 0. How to use this file

For people: read sections 1 and 2 for the why and the experience, 3 for what must be true to build it.
For coding agents: build only what is in scope (2.3). Every requirement has an ID (R-xx).
If a requirement is ambiguous, conflicts with the constitution (2.2), or needs a tool or permission not listed, STOP and ask a human. Do not guess.
A requirement is done only when its evals pass.
`;

const DISCOVER = `
## 1. DISCOVER

### 1.1 North Star and roadmap
North Star: every signed contract's commercial terms reach billing and sales systems correctly within 24 hours, with a lawyer's risk review done before signature.
1. Pre-signing redline in the lawyer's mail client on one contract type, in shadow mode.
2. Pre-signing redline live for design-partner customers.
3. Post-signing term extraction with human approval before any write to finance or sales systems.
4. Selective auto-approval for low-risk terms.

### 1.2 Problem and user evidence
Legal teams spend hours on first-pass review. After signing, key commercial terms (price, term, renewal, escalators) are rarely entered into finance and sales systems correctly, so revenue is missed or delayed.
Evidence to attach before launch: SET interview count and quotes; hours per contract today; share of signed contracts with wrong terms downstream.

### 1.3 Why now
SET model capability to read and redline long contracts; APIs for mail, e-signature, billing and CRM are available; cost per contract is low enough to price profitably (proposed).

### 1.4 Riskiest assumption
Lawyers will accept a redline they did not write if they can see how it was produced and verify it quickly.
Test first: shadow-mode study with 5 lawyers and 30 contracts. Kill or change the product if acceptance of suggested changes is under 60% (proposed).

### 1.5 Success metrics
- Median first-pass review time: down 50% vs. baseline (proposed).
- Redline acceptance rate by lawyers: 70% or more (proposed).
- Key-term extraction field accuracy: 95% or more (proposed).
`;

const DESIGN = `
## 2. DESIGN

### 2.1 Users and roles
| Role | Needs | Authority |
| --- | --- | --- |
| In-house lawyer | Fast first-pass review, trust in each change | Approves or rejects every redline |
| Contract manager | Clean extraction of terms after signing | Approves terms before they are written downstream |
| Customer admin | Controls access and playbook | Sets playbook, permissions and spend limits |

### 2.2 Constitution
Never do:
- Send, sign or share a contract or any email.
- Write to a finance or sales system without recorded human approval.
- Invent a clause, number, party or date that is not in the document.
Priority order when rules conflict: 1 safety and confidentiality, 2 honesty about uncertainty, 3 playbook compliance, 4 helpfulness and speed.
Stop and ask a human when: confidence is Low on a high-risk clause (the lawyer), a clause is not covered by the playbook (the lawyer), or a tool call fails twice (the customer admin).

### 2.3 Scope
In: mail-client review and redline, e-signature trigger, 8-field extraction, human approval, finance and CRM writes, audit log.
Out: drafting contracts from scratch, sending email, other e-signature tools, negotiating with counterparties.
Later: more contract types, auto-approval for low-risk terms.
`;

const DEVELOP = `
## 3. DEVELOP

### 3.1 Requirements
| ID | Requirement | Done when |
| --- | --- | --- |
| R-01 | Read a contract attachment from the email the user selects | Text and structure extracted; failures reported |
| R-02 | Apply the customer playbook and produce a tracked-change redline | Redline passes the helpful, honest, harmless checks |
| R-03 | Save the redline as a draft with a review panel; send nothing | Draft appears; nothing is sent |
| R-04 | Extract the 8 key terms with source passage and confidence | Field accuracy meets the proposed 95% |
| R-05 | Record approver, time and edits; write only approved terms | No write happens without a recorded approval |
| R-06 | Keep an immutable audit log of every step and decision | Any result can be replayed from the log |

### 3.2 Open questions
- Data retention for contracts: SET: retention policy
- Owner of the ground-truth contract set: SET: ground truth owner
`;

const SET_ITEMS = [
  { item: "Interview evidence", why: "The problem section needs interview counts and quotes; only you have them.", section: "Discover" },
  { item: "Why-now sources", why: "Each why-now claim needs a source and date before it can pass the checklist.", section: "Discover" },
  { item: "Ground truth owner", why: "Evals need a named owner for the labeled contract set.", section: "Develop" },
  { item: "Data retention policy", why: "Security and privacy rows need a stated retention rule.", section: "Develop" },
];

const CHECKS = [
  ["C01", "partial", "Gap test is stated; two reasons still need customer confirmation"],
  ["C02", "partial", "Why now is stated but its sources are marked SET"],
  ["C03", "pass", "Section 1.4: assumption, test and 60% kill threshold"],
  ["C07", "pass", "Section 2.2: never-do list, priority order, stop-and-ask rules"],
  ["C08", "pass", "Section 2.2: triggers, who is asked, and what happens while waiting"],
  ["C16", "pass", "Section 1.1: North Star plus ordered roadmap"],
  ["C17", "partial", "Problem is stated; interview evidence is SET"],
  ["C18", "pass", "Section 1.5: metrics with numbers marked proposed"],
  ["C19", "pass", "Section 2.1: roles and authority; approval points in 3.1"],
  ["C21", "pass", "Section 2.3: in, out, later"],
  ["C22", "pass", "Section 3.1: every requirement has an ID and a done-when"],
  ["C26", "missing", "Security, privilege and retention are not covered in this excerpt"],
  ["C13", "missing", "Rollout gating and rollback are not covered in this excerpt"],
].map(([id, result, note]) => ({ id, result, note }));

const tags = (o: { stage: string; prd?: string; checks?: unknown; set?: unknown; choices?: string[] }) =>
  `\n<stage>${o.stage}</stage>` +
  (o.prd ? `<prd>\n${o.prd}\n</prd>` : "") +
  (o.checks ? `<checks>${JSON.stringify(o.checks)}</checks>` : "") +
  (o.set ? `<set>${JSON.stringify(o.set)}</set>` : "") +
  (o.choices ? `<choices>${JSON.stringify(o.choices)}</choices>` : "");

export const SAMPLE_MESSAGES: Msg[] = [
  { role: "user", content: `${IDEA}\n\n(Research: off. I'll paste any evidence myself; mark the rest SET.)` },
  {
    role: "assistant",
    content:
      "Here is the **Discover** draft: the North Star, the problem, why now, your riskiest assumption and how to test it. I have not invented any evidence; interview counts and sources are marked SET for you. Does this look right?" +
      tags({ stage: "discover", prd: HEADER + DISCOVER, set: SET_ITEMS.slice(0, 2), choices: ["Confirm", "Edit"] }),
  },
  { role: "user", content: "Confirm" },
  {
    role: "assistant",
    content:
      "**Design** is next: who uses it, the never-do list, and when it must stop and ask a human. Every starting number is labelled proposed." +
      tags({ stage: "design", prd: HEADER + DISCOVER + DESIGN, set: SET_ITEMS.slice(0, 2), choices: ["Confirm", "Edit"] }),
  },
  { role: "user", content: "Confirm" },
  {
    role: "assistant",
    content:
      "**Develop** turns this into requirements an agent can build. Each has an ID and a done-when test. Two open questions are marked SET." +
      tags({ stage: "develop", prd: HEADER + DISCOVER + DESIGN + DEVELOP, set: SET_ITEMS, choices: ["Confirm", "Edit"] }),
  },
  { role: "user", content: "Confirm" },
  {
    role: "assistant",
    content:
      "The draft is assembled and scored against the living checklist. Three rows are partial because they depend on evidence only you can supply, and two are outside this excerpt. Close the gaps below, or download the PRD as it stands." +
      tags({ stage: "deliver", prd: HEADER + DISCOVER + DESIGN + DEVELOP, checks: CHECKS, set: SET_ITEMS }),
  },
];
