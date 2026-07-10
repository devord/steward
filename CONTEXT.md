# Bulletin

The domain glossary for Bulletin: **dashboards** (personal and
team-shared) of **widgets**, each rendering an **artifact** that a
scheduled **routine** regenerates — reports that update themselves. Architecture decisions live in [`docs/adr/`](./docs/adr/);
the artifact authoring contract in [`docs/widget-standard.md`](./docs/widget-standard.md).

## Language

**Routine**:
A unit of work: "produce this widget's artifact from this skill or prompt,
on this schedule or on demand." Defined declaratively in a data repo's
`data/routines.yaml` (slug, name, instructions; optional skill, schedule,
host, runner, enabled) — the repo's routine pool. Executed by Claude Code
on its **host**, always via the same stable pointer prompt at the
`run-routine` skill (ADR-0005). No `skill:` = prompt-only (ADR-0013); no
`schedule:` = **manual** — updated via the Update button or an interactive
CLI run, staleness badge suppressed (ADR-0016).
_Avoid_: job, cron, automation, workflow

**Host** (`host: cloud | local`, default `cloud`):
Where a routine's runs execute (ADR-0012). `cloud` = an Anthropic cloud
routine on the runner's account (connectors, subscription billing, laptop
off, daily caps; manual cloud routines carry an API trigger instead of a
cron, ADR-0016). `local` = the runner's machine — the only host that can
read local data: launchd plists written by `routines:sync` when scheduled,
a plain interactive session when manual. Interactive skills (they ask
questions before authoring) are necessarily `local` + manual.

**Dashboard**:
A named grid of widgets — one layout file per dashboard at
`data/dashboards/<slug>.yaml` in a data repo (optional `name:` for
display). The directory listing is the index. `main` is the personal
default `/` renders; team dashboards live at `/team/<slug>` (ADR-0010).
_Avoid_: board, view, page

**Widget**:
A cell on a dashboard grid: a routine reference plus a position and a
`size` in grid units (`cols` × `rows`). Declared in that dashboard's
layout file. The widget's body is a sandboxed iframe rendering the
routine's artifact. Any dashboard may arrange any routine from its repo's
pool.
_Avoid_: card, tile, panel

**Artifact**:
The single self-contained, responsive HTML file a routine publishes —
the thing a widget renders. Addressed by convention, never by URL:
`artifacts` branch of the owner's data repo, path `w/<slug>/index.html`
(ADR-0002). Must follow the widget standard (no external requests, gruvbox
tokens, media-query responsive).
_Avoid_: report, page, output file

**Shared repo** (`bulletin`):
This repository — the product. The web app, `packages/schema`, the contract
skills (`run-routine`, `widget-artifact`, `publish-widget`), and the
data-repo template. Contract skills only — content skills live in the
narrowest repo all their users can read: the plugins repo (shared) or a
data repo (private), never here (ADR-0014). Team-visible; never contains
user data.

**Data repo** (`bulletin-data-<login>`):
One private repo per user, created from the template by the app's first-run
wizard. `main` holds config (`data/routines.yaml`,
`data/dashboards/*.yaml`), private routine skills (`.claude/skills/`,
ADR-0014), and any API-trigger tokens (ADR-0016); the orphan `artifacts`
branch holds published artifacts. Privacy is enforced by GitHub repo
boundaries — there is no other access control (ADR-0001).
_Avoid_: user repo, config repo

**Team repo** (`BULLETIN_TEAM_REPO`, e.g. `bulletin-data-team`):
The one org-owned data repo team dashboards live in — same layout as a
personal data repo, shared routine pool, multiple dashboards (ADR-0010).
Org permissions are the access control: everyone who can read it sees all
team routines, layouts, and artifacts.
_Avoid_: org repo, shared data repo

**Runner**:
The GitHub login whose Claude account owns a routine's cloud resource —
its schedule and its API trigger; the canonical executor of scheduled and
manual cloud runs alike (`runner:` in `routines.yaml`, ADR-0010/0016).
Meaningful in the team repo — each teammate's `routines:sync` enacts only
their own entries; personal pools leave it unset (the owner is the runner).

**Skill discovery**:
How the add-routine picker finds routine-capable skills: live `SKILL.md`
frontmatter reads via the contents API from the plugins repo and the
viewer's data repo — no generated catalog (ADR-0015, superseding
ADR-0006). A skill opts in with a `widget:` block (artifact description,
supported sizes, suggested schedule); skills without one never appear.

**Dry run**:
A routine run for testing: same pointer prompt with a dry clause. The
dispatcher resolves config and skills from the local working tree (dirty
state included) and `publish-widget` writes to a local file opened in the
browser — nothing is pushed, the live widget is untouched (ADR-0017).
Launched via `pnpm routine <slug> --dry`.

**Draft**:
Unsynced config edits, held in localStorage keyed by data repo + dashboard
slug with the base blob SHAs they were made against. The UI edits drafts,
never the repo directly; the Sync panel turns a draft into a commit or PR
(ADR-0003).

**Sync**:
The act of persisting a draft: direct commit to the data repo's `main`
(default), or a `dash/config-<timestamp>` branch plus PR when review is
wanted. A moved base SHA means conflict: re-apply the draft on the new
base — on the team repo this is also how concurrent editors are kept from
overwriting each other (ADR-0010).

**Publish**:
The last step of every routine run: write the artifact to
`w/<slug>/index.html` on the data repo's `artifacts` branch, commit, push
(the `publish-widget` skill). Publishing is a git push — there is no upload,
no CDN, no external host (ADR-0002).

**Dispatcher** (`run-routine` skill):
The single entry point every run goes through: resolve the slug in
`data/routines.yaml`, execute that routine's skill (hard-failing on a bad
reference) or its bare `instructions`, enforce the widget standard,
publish. Keeps the cloud routine's prompt down to one stable line
(ADR-0005).

## How a widget stays fresh

1. A run starts: a schedule fires (cloud routine or local launchd), someone
   clicks Update (the app fires the runner's API trigger server-side), or
   someone runs the routine in a terminal (`pnpm routine <slug>`) — every
   path is the same pointer prompt (ADR-0005/0012/0016).
2. `run-routine` reads `data/routines.yaml`, runs the routine's skill or
   prompt, and authors the artifact per the widget standard.
3. `publish-widget` commits it to `w/<slug>/index.html` on the `artifacts`
   branch and pushes.
4. The dashboard (authed with the viewer's GitHub token) fetches the file via
   the contents API and renders it in a sandboxed `srcdoc` iframe; the last
   commit touching that path becomes the "ran 2h ago" footer.
