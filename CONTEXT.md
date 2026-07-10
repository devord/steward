# Bulletin

The domain glossary for Bulletin: **dashboards** (personal and
team-shared) of **widgets**, each rendering an **artifact** that a
scheduled **routine** regenerates — reports that update themselves. Architecture decisions live in [`docs/adr/`](./docs/adr/);
the artifact authoring contract in [`docs/widget-standard.md`](./docs/widget-standard.md).

## Language

**Routine**:
A scheduled unit of work: "run this skill on this cron, produce this
widget's artifact." Defined declaratively in a data repo's
`data/routines.yaml` (slug, name, skill, schedule, instructions, runner,
enabled) — the repo's routine pool. Executed by Claude Code — a cloud
routine on the **runner**'s account whose prompt is a stable one-liner
pointing at the `run-routine` skill (ADR-0005).
_Avoid_: job, cron, automation, workflow

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
skills (`run-routine`, `widget-artifact`, `publish-widget`), routine skills,
the generated skills catalog, and the data-repo template. Team-visible;
never contains user data.

**Data repo** (`bulletin-data-<login>`):
One private repo per user, created from the template by the app's first-run
wizard. `main` holds config (`data/routines.yaml`,
`data/dashboards/*.yaml`); the orphan `artifacts` branch holds published
artifacts. Privacy is enforced by GitHub repo boundaries — there is no
other access control (ADR-0001).
_Avoid_: user repo, config repo

**Team repo** (`BULLETIN_TEAM_REPO`, e.g. `bulletin-data-team`):
The one org-owned data repo team dashboards live in — same layout as a
personal data repo, shared routine pool, multiple dashboards (ADR-0010).
Org permissions are the access control: everyone who can read it sees all
team routines, layouts, and artifacts.
_Avoid_: org repo, shared data repo

**Runner**:
The GitHub login whose Claude account owns a routine's schedule
(`runner:` in `routines.yaml`). Meaningful in the team repo — each
teammate's `routines:sync` enacts only their own entries; personal pools
leave it unset (the owner is the runner).

**Catalog** (`catalog/skills.json`):
The generated index of routine-capable skills. A skill opts in with a
`widget:` block in its SKILL.md frontmatter (artifact description, supported
sizes, suggested schedule); `pnpm gen:catalog` regenerates the JSON and CI
fails if it's stale. Hand-editing the catalog is always wrong.

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
The single entry point every scheduled run goes through: resolve the slug in
`data/routines.yaml`, execute that routine's skill with its `instructions`,
enforce the widget standard, publish. Keeps the cloud routine's prompt down
to one stable line (ADR-0005).

## How a widget stays fresh

1. A schedule fires (Claude cloud routine, local schedule, or a team runner —
   all run the same pointer prompt).
2. `run-routine` reads `data/routines.yaml`, runs the routine's skill, and
   authors the artifact per the widget standard.
3. `publish-widget` commits it to `w/<slug>/index.html` on the `artifacts`
   branch and pushes.
4. The dashboard (authed with the viewer's GitHub token) fetches the file via
   the contents API and renders it in a sandboxed `srcdoc` iframe; the last
   commit touching that path becomes the "ran 2h ago" footer.
