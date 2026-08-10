# Data separates from views, and the board composes them at render time

ADR-0050 split data from presentation and then welded them back together. A
routine emits a `data.json`, the kit renders it, and the renderer's output —
one self-contained HTML file — is what ships. The `data.json` is thrown away
at the end of the run.

That weld is the source of three costs the ADR itself named or half-fixed:

- **"The reach is the migrated set, not the whole board."** A design fix
  travels through injected CSS, so it reaches published artifacts; a
  structural fix has to arrive as markup, so it reaches nothing until every
  routine reruns. ADR-0050 called this "the honest shape of the win: not
  retroactive." It is retroactive only because markup is welded to data.
- **Every widget re-gathers.** Two routines watching the same repo each sweep
  it. There is no way to read what another routine already collected, because
  what it collected no longer exists — only its rendering does.
- **Nothing accumulates.** `repo-modules` recomputes its weekly trend from git
  each run precisely because git _is_ the history; anything whose source has
  no history ("how deep was the queue last Tuesday") is unanswerable and
  unrecoverable. Every run discards the only record that could have answered
  it.

There is also a contradiction sitting in the repo today. `prior-run/SKILL.md`
states that "`data.json` and `state.json` ride in the publish commit for
exactly this," and `publish-widget` commits only `w/<slug>/index.html`. The
sidecar is a decision half-made.

**Decision: a routine publishes data, not a document. A view is a data-less
composition of kit components. The board injects the data at render time, as
it already injects the theme, the mono face and `kit.css`.**

## Four entities, one job each

|             | is                                      | lives                         | cadence                |
| ----------- | --------------------------------------- | ----------------------------- | ---------------------- |
| **Routine** | gathers or synthesises into dataset(s)  | `main`, `data/routines.yaml`  | scheduled or triggered |
| **Dataset** | named data (ADR-0061)                   | `datasets` branch, `d/<name>` | written per run        |
| **View**    | declarative composition + binding slots | `main`, `views/<name>.html`   | authored, rarely       |
| **Widget**  | a view placed on a grid, slots filled   | dashboard layout              | none                   |

The split is not cosmetic. Under the merged entity, nearly every routine
becomes a gatherer whose widget is a formality and every composite widget
becomes a routine whose schedule is a formality — so the pool's state
vocabulary (ADR-0025), the staleness badge, the Update button and the runs
view (ADR-0033) would each branch on _which half of this routine is real_, on
every screen, permanently. ADR-0026 rejected a second routine kind as "a
second contract for zero gain." The gain here is not zero: scheduling,
freshness and triggering attach to the thing that runs, and placement attaches
to the thing that displays.

**ADR-0026's invariant survives with one word changed: the commit is the
receipt.** A data commit for a gather run, a view commit for an authoring run.
Both of its arguments hold — freshness is still keyed to a commit, and the
trust surface is still glanceable, now through the dataset detail view rather
than through a widget the gatherer had no reason to render.

## Why render-time composition, and not a published snapshot

The rejected alternative was to keep rendering data into the file at publish
time and let the board override with fresher data. It preserves more, and it
is the wrong trade:

- **It maintains two renderers forever.** `render.mjs` for publish, a browser
  runtime for re-render, and CI to prove the two agree. Render-time
  composition deletes `render.mjs` from the publish path entirely.
- **It welds every view to one subject.** An artifact carrying a snapshot is
  married to it; `queue-table` bound to `corza-prs` cannot serve `acme-prs`
  without a second near-identical file. That is ADR-0050's original disease in
  a new location, and it forfeits the entire reason for the change.
- **It keeps the non-retroactive reach.** Markup stays in files, so structural
  fixes still never reach published widgets.

The objection that killed our first draft — that ADR-0038's version browsing
would re-hydrate old renders with today's numbers — dissolves once data is
versioned: a version becomes the pair `(view@sha, partition)`, which is
_finer_ than today, because history now exists at data granularity rather than
publish granularity.

## The floor: no snapshot in the iframe, a bake on demand

A data-less view renders nothing without the runtime, so a bad runtime deploy
would blank every widget at once, and anything reading the file outside the
board gets an empty page.

**The app SSRs `view@sha + partition` into one self-contained file on demand**
— for the external-sharing backlog, for export, and for dry runs (ADR-0017),
which no longer have HTML to open. Same React component source as the browser
runtime, two execution hosts, one implementation. The runtime is version-pinned
per view stamp so a bad deploy cannot reach already-placed widgets, and a
widget that cannot render degrades per widget, never per board.

## Views are declarative composition, not authored markup

A view lives in the data repo and is authored in a Claude Code session — the
same rule ADR-0022 already sets for templates ("authored in Claude Code
sessions, never in the app. The app's writable surface stays routines.yaml +
layouts"). The app **places** a view; it never authors one.

But a data-less view whose body is hand-written HTML and `x-for` loops
reimports exactly what ADR-0050 was written to kill, and worse: the shaping
logic now runs at view time, in a sandbox, where nothing validates it and a
bad one fails silently. So the body is **composition only**:

```html
<steward-queue-table source="queue" group-by="assignee"></steward-queue-table>
<steward-stat-tier source="queue" metric="open" tier="lead"></steward-stat-tier>
```

Kit components own all markup, CSS and row shaping. The file names components,
binds them, and sets options. There is no media query, no fit script and no
loop in it to drift. A genuinely new interaction still costs an app-repo PR —
ADR-0050's stated trade, unchanged — and ADR-0050's escape hatch survives as
the thing the validator warns about rather than the normal path.

## Bindings are slots

A view declares named slots with an expected dataset kind; the widget
placement fills them. This is ADR-0020's `params:` generalised one tier up —
same shape, same validation story — and it plugs into the dataset `kind` stamp
so the board refuses a mismatch instead of rendering an empty table that looks
like good news.

```yaml
# views/queue-table.html frontmatter
slots:
  queue: { kind: queue, label: "Queue" }
  faces: { kind: people, label: "Faces", required: false }
```

```yaml
# data/dashboards/eng.yaml
widgets:
  - view: queue-table
    bind: { queue: corza-prs, faces: ff-people }
    x: 0
    y: 0
    cols: 4
    rows: 2
```

**`category` moves to the view**, overridable at the placement. ADR-0044 put
it on the template and materialised it on the routine, on the reasoning that
category says what a widget _is_ — and widgets are views now.

**The `widget:` frontmatter block splits.** Its work half (`params`,
`connectors`, `subjectParam`, `kind`) stays on the gather template; its
presentation half (`sizes`, `category`, the artifact line) moves to the view.
Templates stop describing widgets.

## The broker

The board injects a broker into the iframe, reached by `postMessage` exactly
as ADR-0028 already punches links out of the sandbox:

- `steward.data.read(name)` — the dataset's current file
- `steward.data.history(name, range)` — partitions over a range (ADR-0061)
- `steward.routines.trigger(slug)` — a refresh button inside a widget

**No writes.** And the trigger is scoped: the broker rejects any slug that is
not a producer of a dataset this view declares a binding to. An agent-authored
file in a sandbox must not be able to spend the runner's daily cap on
something it was never bound to.

## Freshness

ADR-0035 rolls a board's freshness up from its widgets: _age is the stalest
widget, stale is any widget overdue against its own schedule_. The same rule
applies one tier down — **a widget's age is its stalest bound dataset, and it
is stale if any bound dataset is overdue against its own producer's
schedule.** Because `max` is associative, the rail's rollup is unchanged. The
kit's `ProvenanceLine` names each dataset and its own age, so nothing is
concealed; it is just not in the chrome.

Two mechanical consequences. ADR-0035 derives freshness from one commits-list
call keyed on `publish: <slug>` touching `w/<slug>/index.html`; that becomes a
message naming the dataset touching `d/<name>.json` — same shape, same single
call, and the rail goes blank if it is missed. And **Update fans out** to
every producer behind a widget; in a shared repo the viewer may not be the
`runner:` for all of them (ADR-0016), so it triggers what it can and says
plainly which it could not, and who owns them.

## There is no second, dataset-less kind of widget

A routine that hits an MCP and shows the result works as it does today. It
commits the digest as JSON instead of as HTML; the raw payload still stays in
`$RUN_DIR` and dies with the run. Two settings cover what an escape hatch
would have been for: a routine may emit only derived and judged fields (never
the raw observations), and `retain: none` keeps the current file with no
partitions.

A true second kind would be a widget that can never take a kit fix, never be
reused and never gain history — and it would be the easiest option in the
wizard, so it would be chosen by default and regretted later.

## Considered options

- **Render-time composition with data-less views (chosen).** One renderer,
  views reusable across datasets, fixes retroactive to the whole corpus.
- **Publish-time snapshot with render-time override.** Preserves the
  self-contained file; costs two renderers forever and forfeits reuse.
- **Narrow data bindings only** (scalars re-bound, structure static). Silently
  wrong the moment a row appears or disappears, which is most of what changes
  in a queue.
- **Views as kit components in the app repo.** Maximum consistency; every new
  widget shape becomes a release, which is too rigid for a content repo meant
  to move faster than the app.
- **Hard-coded bindings inside the view** (hubble's model). Works there
  because reuse comes from opening a different folder; here it just produces
  per-subject copies that drift.

## Consequences

- **A kit fix reaches every widget on next page load, retroactively and
  permanently.** No artifact carries markup, so ADR-0050's "reach is the
  migrated set" caveat retires with the weld.
- **One gather can feed many widgets.** The saving is the gather, not the run:
  a narrating consumer still costs an agent (ADR-0062).
- **ADR-0002's unit changes.** "One self-contained HTML file" becomes "a view
  plus its data, composed by the board". Publishing is still a git push, with
  no upload and no CDN.
- **The board becomes required infrastructure.** Nothing renders without it.
  Pinning and per-widget degrade bound the blast radius; they do not remove it.
- **Authoring a widget is two things, not one** — create a producer, place a
  view. Worth a later convenience where a template ships a producer _and_ a
  default placement, so the simple case stays one step.
- **`w/<slug>/index.html` retires** at migration; the `artifacts` branch
  freezes and stays browsable, and data begins on a new orphan `datasets`
  branch (ADR-0061).
