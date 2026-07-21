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

## Author the artifact

Follow the `widget-artifact` skill for the HTML contract (self-contained,
gruvbox tokens, breakpoints, generated-at meta + footer). Compose for the
widget's size: lead with the one thing the instructions care about most;
add detail only as space allows.

Degrade gracefully: when the instructions name data sources this
environment can't reach, publish what you can with an explicit note of
what was skipped. With no instructions at all, publish an explicit
empty state asking the user to describe the widget.

Carry a context block (`widget-artifact` § The context block): whatever the
tile had to leave out to fit, plus what you couldn't reach this run. Close
with `## Ask me about`, drawn from what the instructions say this widget is
for — the questions its reader would naturally ask next.
