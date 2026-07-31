---
name: custom
description: >-
  The freeform routine template (ADR-0022): the routine's instructions are
  the whole content brief. No widget: block on purpose, because the
  wizard's prompt field is this template's input, so the picker never
  offers it as a card.
---

# Custom

The routine's `instructions` from `data/routines.yaml` are the entire
content brief; there is no fixed procedure here. Read them as the user's
standing request for what this widget should show each run, and use
whatever the run environment reaches (connected tools, attached repos,
the previous artifact on the `artifacts` branch) to fulfill it.

## Compose

**Reach for a primitive before gathering by hand** (ADR-0053). Each one
hands back a concise reading, and a file when the rows outgrow it:

| primitive          | for                                                   |
| ------------------ | ----------------------------------------------------- |
| `/github-prs`      | what is open now — state, CI, reviewers, age          |
| `/github-history`  | what moved over a window, and what is committed ahead |
| `/jira-issues`     | a ticket query, normalized and tallied                |
| `/repo-modules`    | a codebase's module census and entropy score          |
| `/people-registry` | logins or account ids to names and faces              |
| `/prior-run`       | this routine's own last publish                       |
| `/slack-post`      | announcing a finding in a channel                     |

Skills this environment carries from elsewhere compose the same way — they
return prose, which is the whole interface. Gather by hand only for what
none of them covers, and say so in the run: a shape the roster cannot
reach is worth knowing about.

## Emit

Write `data.json` and render it with the kit. The shape is documented once
in `$STEWARD/.claude/skills/widget-artifact/kit/CONTRACT.md` — read it, and
pick the bands that fit what the instructions ask for.

This template names no mapping, because it has no fixed content. What it
does say:

- **The `stat` or the `verdict` is the instructions' single most important
  fact**, whichever shape fits. A count takes `stat`; a state takes
  `verdict`. That is the whole artifact at 340×160, so choose the one a
  reader would want if they only ever saw one number or one word.
- **Reach for a band before inventing a shape.** A list is a `queue`, an
  argument is `prose`, a qualifier is `rail: true`, an auditor's appendix is
  `pageOnly: true`. A magnitude is a `meter` on a column, not a new
  component.
- **If nothing in the contract fits**, that is worth saying in the run
  rather than working around: a shape this template cannot express is a
  missing kit component, and the next routine to want it will hit the same
  wall.

Do not hand-write HTML, CSS or JavaScript. Do not size, trim or theme
anything — the kit owns every tier, and this template has no special claim
on any of them.

Degrade gracefully: when the instructions name data sources this
environment can't reach, publish what you can and put what was skipped on
the provenance line. With no instructions at all, use `empty` to ask the
user to describe the widget — a designed state, not a blank tile.

Carry a context block (`widget-artifact` § The context block): whatever the
tile had to leave out to fit, plus what you couldn't reach this run. Close
with `## Ask me about`, drawn from what the instructions say this widget is
for — the questions its reader would naturally ask next.
