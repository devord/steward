# Every routine names a template; templates are authored in Claude Code

Amends ADR-0013 (prompt-first) and ADR-0021 (routine templates).

Two simplifications, decided together because each makes the other
cleaner.

## Routines always name a `template:`

ADR-0013 made `skill:` optional so a beginner could type a sentence and
get a widget. The optionality was the point, but it left two shapes of
routine through every layer: a schema refine (template or instructions),
two dispatcher branches, and a wizard that had to treat "no pick" as a
first-class source. The dispatcher already knew the truth — "a prompt is
a degenerate template" — so this ADR makes that literal:

- A third built-in, **`templates/routines/custom.md`**, whose body is:
  the routine's `instructions` are the whole content brief; author the
  artifact per the widget standard. It ships **without a `widget:`
  block**, so discovery never lists it; the wizard synthesizes its card
  explicitly — Template is the intent step's one required question, with
  `custom` preselected and the prompt textarea directly beneath it, so
  "open the dialog and type" stays the on-ramp.
- `template:` becomes **required** in the schema; the
  template-or-instructions refine is deleted. The wizard writes
  `template: custom` when the custom card is the pick. One shape of
  routine, everywhere.
- `instructions` stays optional in the schema even for `custom` — the
  wizard requires a non-empty prompt at authoring time, and a custom
  routine that somehow has none degrades to the explicit empty-state
  artifact. Encoding "custom needs instructions" as a schema refine would
  couple `packages/schema` to one template's id.

The on-ramp is untouched: the beginner still types a sentence and gets a
widget. The YAML just names what runs, plainly. Freeform routines get
_better_: their runs now carry `custom.md`'s authoring guidance instead
of leaning on the dispatcher alone.

## Templates are created and edited in Claude Code, not the app

The app's writable surface stays exactly two file kinds — `routines.yaml`
and dashboard layouts — forever. Templates are procedures: code-like
artifacts that version with judgment, authored where code is authored.
The app **reads** templates (the picker cards are the browse surface) and
never writes them, so the draft/sync pipeline never grows arbitrary-file
support.

The promote affordance ("this prompt grew up", ADR-0013's deferred
future) is a **copy-command**, same pattern as manual local runs: the
routine's edit dialog offers a one-liner that asks Claude to generalize
the routine into `templates/routines/<id>.md` — extracting params from
the prose, carrying size/schedule/connectors as `widget:` hints, and
re-pointing the routine. Claude does the actual generalization, which is
judgment the stateless app cannot and should not fake with a form.

## Considered options

- **Reify prompt-only as the `custom` built-in (chosen).** One mechanism;
  the degenerate case gets real authoring guidance; `template:` in the
  YAML is always an honest pointer to a real file.
- **Keep optional `template:`** (status quo): two shapes forever, and the
  wizard/dispatcher/schema each carry the fork.
- **Require a template but keep prompt-only as a schema special case**
  (`template` required unless `instructions`): the same fork with a
  stricter face.
- **In-app template editor / promote dialog.** A markdown editor inside a
  stateless renderer, plus arbitrary-file drafts, to do badly what a
  Claude session does well.

## Consequences

- Schema: `template: z.string().min(1)` required; refine deleted; a
  routines file with a template-less entry fails parse loudly.
- Dispatcher §3 collapses to one path: resolve
  `templates/routines/<template>.md` (data repo → bulletin checkout),
  follow it, hard-fail if absent.
- Migration: both live data repos already name templates on every
  routine; the data-repo seed's prompt-only example gains
  `template: custom`. No legacy tolerance, consistent with ADR-0021's
  no-alias stance.
- "Promote a prompt into a template" ships as the copy-command above; an
  in-app browse/manage page remains open as a future read-only surface.
