---
name: ticket-gaps
description: >-
  Recommend tickets to create by comparing the shipped code against the
  knowledge-base that specifies what it should do — one recommendation per
  gap, each with a copy-ready prompt for a ticket-filing skill. Executed by
  the run-routine dispatcher (ADR-0021).
widget:
  artifact: "Tickets to create where the shipped code lags the knowledge-base spec"
  sizes:
    default: { cols: 2, rows: 2 }
    min: { cols: 1, rows: 1 }
  # Weekly backlog sweep — the gap between spec and code moves slowly.
  schedule: "0 9 * * 1"
  # Instances slug themselves <first-repo>-gaps (ADR-0040); `kind` defaults
  # to `gaps` from the template id.
  subjectParam: repos
  connectors: [Atlassian]
  params:
    - key: repos
      label: Codebase to audit
      type: repos
      required: true
      hint: The app code and the knowledge-base docs the audit reads
    - key: knowledge-base
      label: Knowledge-base path
      placeholder: knowledge-base
      hint: Folder of docs that define what the product should do
    - key: jira
      label: Jira project or base URL
      placeholder: PROJ or https://acme.atlassian.net
      hint: Consulted as a prior (a hint, never ground truth); needs the Atlassian connector
    - key: ticket-skill
      label: Ticket-filing skill
      placeholder: /eng:triage
      hint: The Claude skill each copied prompt invokes to file the ticket
---

# Ticket gaps

Recommend the tickets a team should create, as a widget artifact. You are
invoked by the `run-routine` dispatcher with the routine's `params:` and
`instructions:` from `data/routines.yaml`. The subject is `params.repos` —
the codebase to audit; treat `instructions:` as extra guidance (which
areas matter, what to ignore).

The method is one comparison: what is **built** (the code) against what is
**specified** (the knowledge-base), and every **gap** between them is a
recommended ticket. Jira is a **prior** — a hint that nudges confidence,
never the thing that decides. This artifact is about a codebase, not a
person: it is the same for every viewer, so never write "you."

## Gather

1. **The spec.** Read the `knowledge-base` param's folder (default
   `knowledge-base/`) in the repo — every doc describing intended
   behavior. Break it into discrete **capabilities**: one testable claim
   about what the product should do. `instructions:` are extra spec and
   focus.
2. **The code.** For each capability, find where it lives in the shipped
   code — the route, component, function, endpoint — or establish that it
   does not. Read the implementation, not just filenames: a stub, a
   `TODO`, a hard-coded value, or a path that diverges from the spec is
   evidence, not a match.
3. **The prior** (only when `jira` is set). Query it via the Atlassian
   connector for tickets touching each capability. A ticket marked **Done**
   is a _weak_ signal the capability is built — not proof; it may ship with
   bugs or only part of the spec. A capability with **no ticket** is not
   proof it was skipped. Use Jira only to raise or lower a recommendation's
   confidence, and to surface a possible duplicate — never to decide a
   capability's state.

## Classify — the gap

Assign each capability one state by reading the **code**, not Jira:

- **built** — the code implements it and matches the spec → no ticket.
- **gap** — spec'd, but absent or only partly in the code → recommend a
  ticket.
- **drift** — built, but the code diverges from the spec (wrong behavior,
  missing edge cases, a stub left behind) → recommend a ticket.

Every knowledge-base capability must be accounted for as built / gap /
drift — the whole spec, not a sampled slice. Each **recommended ticket**
(the gaps and drifts) carries:

- **title** — one imperative line, the ticket's summary.
- **spec source** — the doc path and section the capability comes from.
- **code evidence** — the file or path that is missing or partial, or "no
  implementation found."
- **confidence** — high / med / low, lowered when a Jira Done ticket
  suggests the capability may already be handled.
- **Jira prior** — the existing key when one plausibly covers it, else
  "no ticket."

Rank by confidence × impact. Hold back low-confidence guesses rather than
pad the list, and state how many were held back — a short honest list
beats a long speculative one.

## The copy prompt

Each recommendation carries a ready-to-run **prompt** so the reader files
the ticket in one click, paired with their ticket skill (the
`ticket-skill` param, e.g. `/eng:triage`). Compose it as plain text the
skill can act on directly: the skill invocation, the title, then the
evidence — "The spec at `<doc §section>` requires X; `<code path>`
currently does Y (`gap`/`drift`). Acceptance: …" — and the Jira prior line
so the filer can dedupe ("Possibly related: PROJ-123"). A header action
copies every recommendation as one numbered prompt.

## Author the artifact

Follow the `widget-artifact` skill for the HTML contract (self-contained,
gruvbox tokens, breakpoints, generated-at meta + footer). Compose from its
design language: a ledger of recommendations, one row each — a state pill
(`gap` attn-orange, `drift` yellow), the imperative title, the spec → code
evidence as the row body, and confidence + Jira key trailing.

**The copy action.** The one new component. A ghost button in the row's
trailing column: mono 12px, hairline border, ink-dim, inking up on hover
(the pill's tone vocabulary, no fill). On click, copy that row's prompt and
flip the label to "Copied" for ~1.5s. The tile iframe is sandboxed with no
same-origin, so `navigator.clipboard.writeText` may reject — attempt it,
and on failure fall back to a hidden `<textarea>` + `document.execCommand("copy")`
inside the same click handler (a synchronous user gesture, which the
sandbox allows). The section header carries the count and a **Copy all**
action running the same path over the numbered prompt. Copy actions appear
from the 2×2 tier up, where a row has room for the button.

Size behavior:

- **1×1**: the stat — the count of recommended tickets ("N to file"),
  orange when above zero, ink at zero.
- **2×1 / 1×2**: the top recommendations, titles only (state pill + title),
  no copy buttons — a glance at what is owed, not the filing surface.
- **2×2**: the ledger with per-row copy buttons; the fit-list trims to
  `+N more`.
- **Wide tile / full view**: a table — `state · title · spec · code ·
  confidence · jira · copy` — every row shown, with the Copy-all header.
  Spend the width on the evidence columns.

Degrade gracefully: no knowledge-base folder reachable → an empty state
telling the user to point the routine at one. A knowledge-base that the
code fully satisfies → a designed "No gaps — the code matches the spec"
state, not an error or a blank tile.
