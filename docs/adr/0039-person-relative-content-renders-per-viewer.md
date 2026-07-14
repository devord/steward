# Person-relative content resolves per viewer, at render time

"You" belongs to whoever is looking. An artifact is authored once, by a
routine running as one account, then rendered on any dashboard the file's
data repo is shared with — so a widget that says "**needs your review**" or
"**yours**" is speaking to every viewer, but the words were baked relative
to the **routine runner**. `repo-pulse` resolved the viewer once at build
time (`login="$(gh api user -q .login)"`) and stamped the mine/needs-me
grouping into the published HTML; on a shared board everyone saw the
runner's queue mislabeled as their own. Second person is a render-time
fact wearing a build-time value.

Artifacts split into two classes by how they relate to a person, and each
resolves differently:

## Person-owned artifacts — name the owner, at build time

A daily plan, a personal digest — a single-subject artifact built _for_ one
person. There is no viewer for whom "your plan" is right except the owner,
and the owner is known when the routine runs. So these **name the owner in
the third person**: _"Daniel's Daily Plan," "Daniel has 3 deep blocks
left."_ No second person, no injection — the possessive is resolved at
build time because the subject is fixed at build time. A stranger opening
the board reads _whose_ plan it is, not a false "your."

## Shared artifacts — resolve the viewer at render time

A repo pulse, a PR queue — meaningful to everyone who can see the board,
but with **per-viewer facets**: which PRs are _yours_, which _need your
review_. These can't be baked to any one login. Instead:

- **The file is published viewer-neutral.** The static render groups by an
  objective axis (PRs by state: blocked / in review / open), carries no
  "you"/"yours", and is what a raw page and a stranger see. It also carries
  the raw relationship data each row needs — `data-author`, the set of
  directly-requested reviewer logins — never a pre-computed "mine" boolean.
- **The frame injects the viewer.** `frameArtifactHtml` appends a
  `<script data-steward-viewer>window.__STEWARD_VIEWER__={login,name?}</script>`
  alongside the theme and font overrides (ADR-0009/0031) — render-time,
  in-memory, nothing added to the published file. The value is a bare
  identity, never the trigger token; the login is the viewer's own
  (`auth.login`), already threaded to `widget-card` for the ADR-0023 runner
  note.
- **The artifact progressively enhances.** A self-contained script reads
  `window.__STEWARD_VIEWER__` in a `DOMContentLoaded` handler (so it runs
  after the injected script, whatever the append order), and if that login
  authors or is directly requested on any row, re-buckets the rows into
  _Needs your review_ / _Yours_ / _Open_ and relabels in the second person.
  Wrapped in `try`/`catch`: any failure, a missing viewer, or a viewer with
  **no stake** in the data leaves the neutral render untouched. Neutral is
  the honest floor — it never claims a queue is yours when it isn't.

The published contract stays "one self-contained HTML file, no network"
(widget-standard §1): the viewer is injected, not fetched, exactly like the
theme. The enhancement is the first sanctioned use of JS for _content_
rather than fit/responsiveness — legitimized in widget-standard's new
"Person-relative content" section and the `widget-artifact` skill.

## Considered options

- **Publish one artifact per viewer** — a file per reader on the artifacts
  branch, picked by login at render. Rejected: combinatorial repo growth,
  every run re-committing N near-identical files, and the set of viewers
  isn't even known at build time (sharing is a GitHub grant, ADR-0023).
- **Server-render the personalization** — the app rewrites the HTML per
  request. Rejected: artifacts are static files rendered in a null-origin
  sandbox (ADR-0002/0028); the app would have to parse and mutate every
  artifact's DOM, coupling the chrome to each routine's markup. Injection +
  in-artifact enhancement keeps the app ignorant of artifact internals.
- **Name the owner everywhere, drop second person entirely** — "Daniel's
  review queue" even on the shared pulse. Rejected for shared artifacts:
  it's correct but kills the point — the pulse is _for_ every reviewer, and
  a viewer-neutral-but-named queue can't tell _you_ what needs _you_. Kept
  for genuinely single-subject artifacts, where it is exactly right.
- **Keep build-time resolution** — status quo. Rejected: it is the bug.

## Consequences

- `repo-pulse` and any future shared artifact author a neutral static
  render plus a viewer enhancer; person-owned artifacts (`daily-plan`) name
  their owner and never say "you."
- `frameArtifactHtml` gains a `viewer?` argument; the board passes the
  signed-in login on both the tile and full-view calls. Surfaces without a
  signed-in viewer in scope (the version dialog, the template-preview) pass
  none and render neutral — correct, not degraded.
- The raw artifact page and the contact sheet stay viewer-neutral; they are
  debug/QA surfaces, and "your" has no referent there.
- Personalization is eventually consistent like every contract change: the
  injection reaches already-published artifacts immediately, but the
  neutral-static + enhancer shape only lands as routines rerun on the new
  templates (widget-standard §6's note on baked-in behavior).
