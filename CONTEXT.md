# Steward

The domain glossary for Steward: **dashboards** (in any of a user's data
repos, private or shared) of **widgets**, each rendering an **artifact**
that a scheduled **routine** regenerates — reports that update themselves. Architecture decisions live in [`docs/adr/`](./docs/adr/);
the artifact authoring contract in [`docs/widget-standard.md`](./docs/widget-standard.md).

## Language

**Routine**:
A unit of work: "produce this widget's artifact from this template, on
this schedule or on demand." Defined declaratively in a data repo's
`data/routines.yaml` (slug, name, template; optional instructions,
params, schedule, host, runner, enabled) — the repo's routine pool.
Executed by Claude Code on its **host**, always via the same stable
pointer prompt at the `run-routine` skill (ADR-0005). Every routine
names a `template:` — freeform ones name the `custom` built-in, whose
whole brief is the routine's `instructions` (ADR-0022); no `schedule:` =
**manual** — updated via the Update button or an interactive CLI run,
staleness badge suppressed (ADR-0016).
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
display). The directory listing is the index. The home repo's `main` is
the default `/` renders; every other board lives at
`/r/<owner>/<repo>/<slug>` (ADR-0023).
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

**Shared repo** (`steward`):
This repository — the product. The web app, `packages/schema`, the contract
skills (`run-routine`, `widget-artifact`, `publish-widget`), the data-repo
template, and the built-in routine templates (`templates/routines/`,
ADR-0021). Team- or user-specific templates live in the narrowest data
repo all their users can read (ADR-0014/0021), never here. Team-visible;
never contains user data.

**Data repo**:
A repo holding one routine pool, its dashboards, and its templates —
a user can have any number (ADR-0023). `main` holds config
(`data/routines.yaml`, `data/dashboards/*.yaml`), the repo's routine
templates (`templates/routines/`, ADR-0021), and any API-trigger tokens
(ADR-0016); the orphan `artifacts` branch holds published artifacts.
Discovered by the `steward-data` GitHub **topic**: every tagged repo the
viewer's token can read appears in the app. Access is GitHub repo
permissions — there is no other access control (ADR-0001/0023).
_Avoid_: user repo, config repo

**Home repo** (`steward-data-<login>`):
The one data repo resolved by naming convention rather than topic — one
private repo per user, created from the template by the first-run wizard.
Anchors `/`, the setup wizard, and the top of the rail (ADR-0001/0023).
_Avoid_: personal repo (a home repo is one of possibly many private ones)

**Shared (data) repo**:
Any data repo that isn't the viewer's home repo — an org's, or another
user's shared with them. Whoever can read it sees all its routines,
layouts, and artifacts; local/cloud enactment follows the runner rule.
Different shared repos may belong to entirely different circles of people
(ADR-0023, superseding ADR-0010's single team repo).
_Avoid_: team repo (legacy — implies there is exactly one)

**Topic** (`steward-data`, env `DATA_REPO_TOPIC`):
The GitHub topic marking a repo as a data repo — the whole registry is a
topic search with the viewer's token (ADR-0023). Create paths tag new
repos explicitly (template generation doesn't copy topics); registering
an existing repo is adding the tag.

**Runner**:
The GitHub login whose Claude account owns a routine's cloud resource —
its schedule and its API trigger; the canonical executor of scheduled and
manual cloud runs alike (`runner:` in `routines.yaml`, ADR-0016/0023).
Meaningful in shared repos — each collaborator's `routines:sync` enacts
only their own entries; home pools leave it unset (the owner is the
runner).

**Routine template**:
A parameterized routine definition the wizard instantiates: a plain
markdown file at `templates/routines/<id>.md` — frontmatter (`name`,
`description`, the `widget:` block: artifact line, sizes, schedule,
params, suggested connectors), body = the authoring procedure the
dispatcher follows (ADR-0021, replacing content skills). Lives in the
narrowest repo all its users can read: this repo (**built-in**, shipped
in the app bundle), the team data repo (**team**), or a personal data
repo (**private**). The picker discovers data-repo templates live via
the contents API (ADR-0015); files without a `widget:` block never
appear (deliberately so for the `custom` built-in — the wizard's prompt
field is its input); a data-repo template shadows a same-named built-in.
Templates are authored in Claude Code sessions, never in the app — the
app's writable surface stays routines.yaml + layouts (ADR-0022).
_Avoid_: skill (that's the contract tier), recipe, preset, blueprint

**Param**:
An input a template declares in its `widget:` frontmatter (`key`,
`label`, `type: string | select | repos`, `required`) that the
add-routine wizard renders as a form field; the answers live on the
routine as a structured `params:` map the dispatcher passes to the
template alongside `instructions` (ADR-0020). `repos`-type answers are
also unioned into the routine's `repos:` so the cloud run can read what
the template watches.
_Avoid_: argument, option, setting

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
`data/routines.yaml`, execute that routine's template (hard-failing on a
bad reference, ADR-0021/0022) with its `instructions` and `params`,
enforce the widget standard, publish. Keeps the cloud routine's prompt
down to one stable line (ADR-0005).

## How a widget stays fresh

1. A run starts: a schedule fires (cloud routine or local launchd), someone
   clicks Update (the app fires the runner's API trigger server-side), or
   someone runs the routine in a terminal (`pnpm routine <slug>`) — every
   path is the same pointer prompt (ADR-0005/0012/0016).
2. `run-routine` reads `data/routines.yaml`, follows the routine's
   template or prompt, and authors the artifact per the widget standard.
3. `publish-widget` commits it to `w/<slug>/index.html` on the `artifacts`
   branch and pushes.
4. The dashboard (authed with the viewer's GitHub token) fetches the file via
   the contents API and renders it in a sandboxed `srcdoc` iframe; the last
   commit touching that path becomes the "ran 2h ago" footer.
