# Steward

The domain glossary for Steward: **dashboards** (in any of a user's data
repos, private or shared) of **widgets**, each rendering an **artifact**
that a scheduled **routine** regenerates. Reports that update themselves.
Architecture decisions live in [`docs/adr/`](./docs/adr/); the artifact
authoring contract in [`docs/widget-standard.md`](./docs/widget-standard.md).

## Language

**Routine**:
A unit of work: "produce this widget's artifact from this template, on
this schedule or on demand." Defined declaratively in a data repo's
`data/routines.yaml` (slug, name, template; optional instructions,
params, schedule, host, runner, enabled), which is the repo's routine pool.
Executed by Claude Code on its **host**, always via the same stable
pointer prompt at the `run-routine` skill (ADR-0005). Every routine
names a `template:`; freeform ones name the `custom` built-in, whose
whole brief is the routine's `instructions` (ADR-0022). No `schedule:` =
**manual**, updated via the Update button or an interactive CLI run,
staleness badge suppressed (ADR-0016).
_Avoid_: job, cron, automation, workflow

**Host** (`host: cloud | local`, default `cloud`):
Where a routine's runs execute (ADR-0012). `cloud` = an Anthropic cloud
routine on the runner's account (connectors, subscription billing, laptop
off, daily caps; manual cloud routines carry an API trigger instead of a
cron, ADR-0016). `local` = the runner's machine, the only host that can
read local data: launchd plists written by `routines:sync` when scheduled,
a plain interactive session when manual. Interactive skills (they ask
questions before authoring) are necessarily `local` + manual.

**Run**:
One execution of a routine on its host. A schedule fires, the app fires
the API trigger, or a terminal session runs the pointer prompt. Every run
ends by publishing, so its evidence is its **publish receipt**: the one
commit touching `w/<slug>/index.html` on the artifacts branch
(ADR-0002/0026). The routine detail view derives run history from those
receipts (ADR-0033), and reopens each receipt's render, or two side by
side to compare (ADR-0038). A run that fails before publishing leaves no
receipt; its session log lives on the routine's claude.ai page, which the
app links to but cannot read (the trigger token is trigger-only, ADR-0016).
_Avoid_: execution, invocation, job run

**Dashboard**:
A named grid of widgets, one layout file per dashboard at
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
_Avoid_: card, tile, panel; also a cell on someone else's dashboard product
(monitoring tools call those widgets too) — here the word is always ours

**Category** (and its **band**):
What a widget _is_, grouped: "Project Management", "Engineering". The third
axis, orthogonal to the board's subject and the routine's kind (ADR-0040/0044).
Declared by a routine template (`widget.category`), overridden or opted out of
(`null`) on the routine itself, and materialized there on write so a board
knows its groups without waiting on templates. The **band** is how a category
renders: a labeled strip on the board with its own grid instance, ordered by
`data/repo.yaml` `categories:`, led by the unlabeled band of uncategorized
widgets. A board with fewer than two categories renders flat. Collapsing a band
folds it on every board — a device preference, not data.
_Avoid_: tag, group (a repo's boards group into **sections**, one tier up),
lane, swimlane

**Artifact**:
The single self-contained, responsive HTML file a routine publishes, the
thing a widget renders. Addressed by convention, never by URL:
`artifacts` branch of the owner's data repo, path `w/<slug>/index.html`
(ADR-0002). Must follow the widget standard (no external requests, gruvbox
tokens, media-query responsive).
_Avoid_: report, page, output file; also the error-tracker sense of the
word, where a "release artifact" is an uploaded source map — never one of
these

**Shared repo** (`steward`):
This repository, the product. The web app, `packages/schema`, the contract
skills (`run-routine`, `widget-artifact`, `publish-widget`), the generic
**primitives** (ADR-0053), the data-repo template, and the built-in routine
templates (`templates/routines/`, ADR-0021). Team- or user-specific
templates and primitives live in the narrowest data repo all their users
can read (ADR-0014/0021/0053), never here. Team-visible; never contains
user data.

**Data repo**:
A repo holding one routine pool, its dashboards, and its templates. A
user can have any number (ADR-0023). `main` holds config
(`data/routines.yaml`, `data/dashboards/*.yaml`), the repo's routine
templates (`templates/routines/`, ADR-0021), and any API-trigger tokens
(ADR-0016); the orphan `artifacts` branch holds published artifacts.
Discovered by the `steward-data` GitHub **topic**: every tagged repo the
viewer's token can read appears in the app. Access is GitHub repo
permissions, and there is no other access control (ADR-0001/0023).
_Avoid_: user repo, config repo

**Home repo** (`steward-data-<login>`):
The one data repo resolved by naming convention rather than topic. One
private repo per user, created from the template by the first-run wizard.
Anchors `/`, the setup wizard, and the top of the rail (ADR-0001/0023).
_Avoid_: personal repo (a home repo is one of possibly many private ones)

**Shared (data) repo**:
Any data repo that isn't the viewer's home repo: an org's, or another
user's shared with them. Whoever can read it sees all its routines,
layouts, and artifacts; local/cloud enactment follows the runner rule.
Different shared repos may belong to entirely different circles of people
(ADR-0023, superseding ADR-0010's single team repo).
_Avoid_: team repo (legacy; implies there is exactly one)

**Topic** (`steward-data`, env `DATA_REPO_TOPIC`):
The GitHub topic marking a repo as a data repo. The whole registry is a
topic search with the viewer's token (ADR-0023). Create paths tag new
repos explicitly (template generation doesn't copy topics); registering
an existing repo is adding the tag.

**Runner**:
The GitHub login whose Claude account owns a routine's cloud resource,
its schedule and its API trigger. The canonical executor of scheduled and
manual cloud runs alike (`runner:` in `routines.yaml`, ADR-0016/0023).
Meaningful in shared repos, where each collaborator's `routines:sync`
enacts only their own entries; home pools leave it unset (the owner is the
runner).

**Connector**:
An external service a cloud run may call over MCP, named in a routine's
`connectors:` allowlist by its canonical sanitized name — what
claude.ai/customize/connectors shows, spaces as hyphens (`Google-Calendar`,
`Atlassian-Rovo`). The name is a service requirement, resolved against the
routine's **runner**'s account roster at sync time; absent or empty means
the run gets none (ADR-0018/0046). Directory connectors share names across
accounts; custom ones are per-account by nature.
_Avoid_: integration, MCP server (the protocol tier), uuid (resolution
output, never authored)

**Routine template**:
A parameterized routine definition the wizard instantiates: a plain
markdown file at `templates/routines/<id>.md`, with frontmatter (`name`,
`description`, the `widget:` block: artifact line, sizes, schedule,
params, suggested connectors), body = which **primitives** to compose and
how to present their **readings** (ADR-0021/0053). It says what to say,
never how to gather it or how the document is structured. Lives in the
narrowest repo all its users can read: this repo (**built-in**, shipped
in the app bundle), the team data repo (**team**), or a personal data
repo (**private**). The picker discovers data-repo templates live via
the contents API (ADR-0015); files without a `widget:` block never
appear (deliberately so for the `custom` built-in, whose input is the
wizard's prompt field); a data-repo template shadows a same-named built-in.
Templates are authored in Claude Code sessions, never in the app. The
app's writable surface stays routines.yaml + layouts (ADR-0022).
_Avoid_: recipe, preset, blueprint

**Skill**:
A unit of agent behaviour shipped as a Claude Code skill. Two roles,
split by who invokes (ADR-0053):

- **contract** — the platform mechanics every run passes through:
  `run-routine`, `widget-artifact`, `publish-widget`. They version with
  the app and the widget standard.
- **primitive** — a composable piece of routine work (gather, judge, or
  act) a **routine template** pulls in by name. Model-invoked, because a
  user-invoked skill cannot be reached by another skill. Hands back a
  **reading** and stops there: presentation is the template's job.
  Generic ones ship in this repo; client-specific ones live in the data
  repo that owns their subject (ADR-0014, amended).

A primitive serving one routine today is still a primitive — arity is not
nature.
_Avoid_: capability, helper, plugin, content skill (ADR-0021's retired
tier), routine skill (collides with **Routine**)

**Reading**:
What a **primitive** hands back: a concise markdown report, ending the
skill's run. When the payload outgrows honest prose it also names a file
beneath `$RUN_DIR` holding every row. Text is the interface and the file
is an optimization it points at — which is what lets a template compose
skills nobody here wrote, since their output is prose too.
_Avoid_: result, output, payload (that's the file), return value

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
browser. Nothing is pushed, and the live widget is untouched (ADR-0017).
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
base. On the team repo this is also how concurrent editors are kept from
overwriting each other (ADR-0010).

**Publish**:
The last step of every routine run: write the artifact to
`w/<slug>/index.html` on the data repo's `artifacts` branch, commit, push
(the `publish-widget` skill). Publishing is a git push. There is no upload,
no CDN, no external host (ADR-0002).

**Dispatcher** (`run-routine` skill):
The single entry point every run goes through: resolve the slug in
`data/routines.yaml`, open a `$RUN_DIR` for the run's readings and
payloads, execute that routine's template (hard-failing on a bad
reference, ADR-0021/0022) with its `instructions` and `params`, enforce
the widget standard, publish. Keeps the cloud routine's prompt down to
one stable line (ADR-0005).

**Degrade**:
What a failed GitHub read becomes instead of a crash: a dead token turns
into a re-auth screen, and every transient failure — outage, rate limit,
timeout, network blip — into a refreshable "try again" page that the next
load usually clears. A reader never meets a stack trace on a path the app
expected to fail.
_Avoid_: fail, error out, fallback

## How a widget stays fresh

1. A run starts: a schedule fires (cloud routine or local launchd), someone
   clicks Update (the app fires the runner's API trigger server-side), or
   someone runs the routine in a terminal (`pnpm routine <slug>`). Every
   path is the same pointer prompt (ADR-0005/0012/0016).
2. `run-routine` reads `data/routines.yaml` and follows the routine's
   template: it composes the **primitives** the template names, presents
   their **readings** as a `data.json`, and renders it with the kit.
3. `publish-widget` commits it to `w/<slug>/index.html` on the `artifacts`
   branch and pushes.
4. The dashboard (authed with the viewer's GitHub token) fetches the file via
   the contents API and renders it in a sandboxed `srcdoc` iframe; the last
   commit touching that path becomes the "ran 2h ago" footer.
