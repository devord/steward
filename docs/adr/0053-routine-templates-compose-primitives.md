# Routine templates compose primitives and present their readings

ADR-0050 found that 22% of routine-template prose restated the rendering
contract, moved that contract into the kit, and set templates a target of
40–120 lines. The restatement went. The templates did not shrink.

They did not shrink because rendering was never the bulk of them. What is
left, at 4,520 lines across fourteen templates, is gather mechanics, domain
rules, and paragraphs commemorating production failures — and all three are
written per routine, re-derived per run, and reusable by nobody. The
duplication is plain in a grep: **ten** templates describe reading their own
previous artifact off the artifacts branch, **nine** describe querying Jira,
**five** describe pulling PRs out of GitHub. Each description is a little
different from the others, and none of them is the authority.

The consequence is the one ADR-0050 named and then only half-fixed:
_instructions do not hold; mechanisms do_. Two templates read the same
spreadsheet on the same morning and published `6` and `7` for the same
figure. That was hand-tallying, and hand-tallying is what a template is —
prose asking a model to re-derive an answer that a script could have
computed once.

## Why this is not the thing ADR-0021 retired

ADR-0021 deleted content-as-skills, and its reasons were good ones: plugin
install fallbacks in the dispatcher, an extra repo in every cloud routine's
`repos:`, plugin↔app release ordering, and `repo-pulse` polluting every
interactive session's skill list.

Every one of those was a complaint about a **routine definition** wearing a
skill's clothes. `repo-pulse` had no business being reachable in a chat
session, and its own description admitted it: _"not meant for interactive
invocation."_ A capability is a different animal, and it passes the test the
routine definition failed — _could the model usefully reach for this on its
own?_ "Gather the PR queue for these repos" plainly yes; "be the repo-pulse
widget routine" plainly no.

So ADR-0021's ban stands exactly where it was drawn. **Routine definitions
stay templates. Capabilities become skills.**

## Decision

**A routine template composes primitives and presents their readings.**

A **primitive** is a composable piece of routine work — gather, judge, or act
— shipped as an ordinary Claude Code skill. A **reading** is what it hands
back. Four rules make them compose.

**1 — Text is the interface; a file is an optimization it points at.** A
primitive ends with a concise markdown reading in the transcript. When the
payload outgrows honest prose — sixty PR rows — it also writes a file and
names the path in the reading. Nothing is declared in frontmatter and nothing
is schema-checked, because the contract has to accept skills we do not own:
a template composes Anthropic's skills, a plugin's, and its own the same way.

**2 — A primitive stops at the reading.** Presentation lives in the template,
always. This is the line `ui-figma-drifts` currently crosses — its
`compile.mjs` emits the finished kit document — and crossing it puts a
widget's whole appearance somewhere no template review will look.

**3 — The agent reaches; a script derives.** This is forced, not chosen. A
cloud run has no `gh` and no GitHub API egress; GitHub is reachable only as
the agent's `mcp__github__*` tools, which a `node` subprocess cannot call. So
the agent must own the reach. Everything downstream of it — arithmetic,
diffing, ordering, tallying — is a script, because that half is where the
`6`-versus-`7` bug lives. A primitive with no arithmetic to get wrong is
prose only.

**4 — Prose invocation, one run directory.** A template invokes a primitive
by name in prose — _"Run the `/github-prs` skill over `params.repos`"_ — never
by cross-file path. `run-routine` exports `$RUN_DIR`; every primitive writes
beneath it. A run's whole trace then sits in one folder, which is what makes
a dry run inspectable.

### Placement: ADR-0014 amended

ADR-0014 reserved this repo for _"contract skills only. No content skills,
ever."_ Its actual rule — a skill lives in the narrowest repo all its users
can read — survives untouched. The "ever" does not.

Generic primitives ship here, for the same reason ADR-0021 moved built-in
templates here: parameterized and generic is platform, not content. A
built-in template that composes a primitive absent from a fresh install is a
built-in that does not work, and the data-repo scaffold ships no
`.claude/skills/` at all. Client-specific primitives stay in the data repo
that owns their subject.

## Consequences

- **`CONTEXT.md` gains `Skill` and `Reading`.** Skills split by invocation,
  into contract and primitive; the entry for `Routine template` becomes
  compose-and-present. `_Avoid_: skill` is dropped from that entry — it was
  reserving a word this ADR gives back.
- **Primitives are model-invoked, and that costs context.** A user-invoked
  skill cannot be reached by another skill, so composability requires it.
  Roughly seven descriptions join every interactive session in a steward
  checkout. This is ADR-0021's session-pollution cost, paid deliberately and
  in exchange for something ADR-0021's occupants never offered: a skill worth
  reaching for by hand.
- **A primitive used once is still a primitive.** Arity is not nature, and
  naming the singular ones differently would freeze this month's usage into
  the vocabulary. `corza-verdict` serves one routine today.
- **`repo-stats` is reclassified, not rewritten.** It gathers, compiles,
  renders and publishes behind one script, which rule 2 forbids a primitive
  from doing. It is not a primitive — it is a self-contained routine that
  ships as a script, and its 66-line template was the proof this ADR is built
  on. Left alone.
- **The rationale prose is deleted rather than relocated.** Every fat template
  carries paragraphs commemorating a bug — the divisor printed twice, the pin
  that advertised the calm rows. A notes file nobody must read is where
  sediment goes to keep accumulating, so it goes to git history instead, and
  the scripts implement the current spec only. Some of these will be
  re-shipped once before anyone notices. That is the accepted price.

## Considered options

- **Primitives as skills, templates as composition (chosen.)**
- **Leave the work in templates and prune harder.** Prose gets shorter; the
  same gather still exists nine times, and the hand-tallying that produced two
  different answers to one question is untouched.
- **A primitive may emit kit blocks the template arranges.** More reuse of
  presentation, at the cost of versioning every primitive against the kit and
  scattering a widget's appearance across both tiers again.
- **A shared primitives repo, installed as a plugin.** Exactly the arrangement
  ADR-0021 retired, and it would reintroduce every cost listed there for a
  tier with no distinct readership.
