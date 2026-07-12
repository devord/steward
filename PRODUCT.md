# Product

## Register

product

## Users

Daniel and, later, the Form Factory team — developers who live in
terminals, editors, and GitHub. They open Steward a few times a day for a
glance, not a session: "what's my plan, what needs my review, is anything
stale?" Ambient context: a dark editor, a wall of monospace, dozens of tabs.
Steward is the calm one.

## Product Purpose

A personal dashboard of living widgets: each widget renders an HTML
artifact that a scheduled Claude Code routine regenerates — reports that
update themselves. Success = the user trusts the board enough to glance
instead of digging: fresh widgets, honest staleness, zero manual upkeep.
All state lives in the user's own GitHub repos; the app is a stateless
renderer and editor.

## Brand Personality

Terminal-calm. Quiet, precise, monospace-flavored — tmux/lazygit energy,
not SaaS energy. The chrome recedes; the widgets are the color and the
content. Confidence through restraint: exact alignment, few words, readable
type, no decoration that doesn't inform.

## Anti-references

- Generic SaaS dashboards: gradient glass, hero metrics, identical card
  grids, Linear/Vercel-clone gloss.
- Grafana/analytics chrome: heavy toolbars, panel borders everywhere,
  chart-tool density for its own sake.
- Notion-style softness: rounded-everything, emoji-forward empty states,
  hand-holding copy.

## Design Principles

1. **Widgets glow, chrome recedes.** The grid is a picture frame; every
   pixel of chrome must justify itself against the artifacts it hosts.
2. **Freshness is the product.** Time-since-run, staleness, and sync state
   are first-class UI, always honest, never decorative.
3. **Git is visible, not hidden.** Drafts, diffs, commits, and PRs are the
   mental model — name them plainly; never euphemize ("save" is a commit).
4. **Glanceable in two seconds.** Hierarchy tuned for the drive-by look:
   state legible from across the room, detail on approach.
5. **Terminal manners.** Monospace for identifiers and state, Sentence case
   for labels and prose (machine strings kept verbatim), keyboard-friendly,
   no motion that outlives 200ms.

## Accessibility & Inclusion

WCAG 2.1 AA across every theme, enforced in code: theme.test.ts holds each
palette to body text ≥4.5:1 on bg/bg1/bg2, secondary ink ≥4.5:1, metadata
ink ≥3:1, and readable primary buttons — where an upstream palette misses,
the role is repointed within its own ramp (ADR-0009; ink-faint remains for
de-emphasized metadata only, never body copy). Full keyboard operability
for editing, sync, and the settings pickers (Base UI primitives and real
radiogroups carry focus/ARIA). Respect prefers-reduced-motion; staleness
never encoded by color alone (badge carries text). Chrome is localized
(en, pt-BR) with the locale reflected in `<html lang>`.
