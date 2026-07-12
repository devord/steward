# Prompt-first routines: the skill is optional

> Amended by ADR-0021 (skills became routine templates) and ADR-0022
> (`template:` is required; prompt-only lives on as the `custom` built-in
> template). The prompt-first wizard UX below still stands.

A routine's content logic doesn't have to be a skill. `skill:` in
`routines.yaml` becomes **optional**; a routine is valid with only
`instructions:`. The dispatcher's behavior:

- **`skill:` present** — invoke it with the routine's `instructions:`, and
  **hard-fail loudly** if the name doesn't resolve. That error surface is
  the value of keeping `skill:` a structured field.
- **`skill:` absent** — run `instructions:` directly. The contract still
  holds: whatever the content source, `run-routine` pipes the output
  through `widget-artifact` and `publish-widget`. A prompt is a degenerate
  skill; the artifact is valid either way.
- A skill _mentioned inside_ a prompt ("use the repo-pulse skill") resolves
  through Claude Code's normal skill resolution — best-effort: a typo means
  Claude improvises instead of erroring. That's the trade freeform accepts,
  and the UI shouldn't pretend otherwise.

The add-routine UI inverts accordingly: **prompt-first, skill as an
accelerator**. One textarea ("describe what this widget should show each
run"); below it, routine-capable skills (ADR-0015) as optional cards.
Picking one sets `skill:` and pre-fills schedule/size from its `widget:`
metadata; skipping leaves a prompt-only routine with wizard defaults. The
beginner types a sentence and gets a widget; the power user picks a curated
skill. The `routines.yaml` diff keeps the difference legible.

## Considered options

- **Optional skill (chosen)** — lowest barrier to a first widget, keeps
  skills as the quality/curation/sharing tier routines graduate into.
- **Mandatory skill** — every widget requires authoring a skill first; the
  friction v1 is trying to remove.
- **Prompt-only everything** (drop `skill:`) — matches Claude Code's own
  routine UI, but loses hard-fail resolution, metadata-driven defaults,
  and the team's "our project report looks like _this_" curation point.

## Consequences

- Prompt-only routines have no `widget:` metadata: no size hints, no
  suggested cadence — defaults apply. Output quality is more variable than
  a tuned skill's; that's the on-ramp, not the destination.
- "Promote a grown-up prompt into a skill" is a natural future affordance,
  not v1.
