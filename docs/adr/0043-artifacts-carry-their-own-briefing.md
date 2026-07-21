# An artifact carries its own briefing, and the host reads it from the file

A widget is a compressed view. The gaps tile shows 15 of 61 rows and holds 54
back; the progress report renders one bar for 209 tickets and one "15d behind"
for the reasoning that produced it. Glancing is the point (ADR-0019) — but the
moment a reader wants to _act_ on what they glanced at ("why are we behind",
"where did these gaps come from", "what do we cut"), the artifact has nothing
to hand them. They retype the situation into Claude from what they can see,
which is the truncated half, and they lose the caveats the run knew about and
the rows it dropped.

**Decision: an artifact may embed a markdown briefing of itself in an inert
`<script type="text/markdown" id="steward-context">`, and the board offers a
button that copies it.** The block is authored to be _richer_ than the render —
the held-back rows, the reasoning behind a headline number, the run's own
caveats, and a closing `## Ask me about` naming the questions that widget
invites.

**The host reads it out of the file, not out of the frame.** This is the load
-bearing part. The board already holds the published HTML as a string on its
way to `srcDoc` (ADR-0002 renders by API read, not by URL), so extracting the
block is a string operation on data the host owns. No `postMessage`, no
`allow-same-origin`, nothing added to the three trivial artifact→host messages
that exist today. ADR-0028's boundary — in-frame navigation, same-origin, and
the network all stay blocked — is untouched, and the no-network guarantee that
makes the sandbox trustworthy is not weakened to buy this.

So this is a **content convention, not a protocol** — the same category as
`<meta name="widget-generated-at">` (a fact baked into the file, read by
whoever cares) rather than the `__STEWARD_VIEWER__` injection, which is a real
channel. Nothing new can be asked of a running artifact; a briefing is as
static as the render beside it.

**Recommended, not required.** The validator warns on a missing block and
publishes anyway; the button renders only when one is present. Every artifact
published before this ADR keeps working, and a routine with nothing worth
saying beyond its render is not forced to pad. A button that copied an empty
string would be worse than no button.

**Inertness comes from the container, not from discipline.** An unknown script
type is neither executed nor rendered by any browser, so the block costs no
layout, no paint, and no request even though it sits inside the document. Its
one sharp edge is that `</script>` closes it, so a briefing quoting markup
escapes it as `<\/script>` and the reader restores it — the JSON-in-script
idiom. The validator errors on an unescaped one rather than letting a briefing
truncate in silence.

**The validator excises the block before its other checks.** A briefing is
prose _about_ a subject, so it says things like "add a `fetch(` call" and
quotes hex values — read as markup by the self-containment and palette checks,
it would fail the artifact on its own commentary. Every check reads the file
with the block removed.

Cost: 5–15kb per artifact, re-committed to the artifacts branch on every run,
for content no viewer sees unless they ask for it. And the briefing is authored
per run, so its quality varies with the run the way the render already does —
the skill pins a section skeleton to bound the drift, but a thin run writes a
thin briefing. Accepted because the alternative costs the reader far more: the
whole point of a glanceable board is to shorten the path from noticing to
acting, and retyping the situation by hand is the longest part of that path.

Rejected: converting the rendered HTML to markdown host-side (the tile is the
compressed view — a faithful conversion of it reproduces exactly the truncation
that makes the paste useless, and it would couple the host to every artifact's
markup); asking the artifact for its briefing over `postMessage` (a real
channel, needing a request/response protocol and a timeout, to fetch something
already sitting in a string the host holds); deep-linking to claude.ai with the
briefing in the query string (10–50kb of context against a practical URL
ceiling of a few kb — it would work for the small cases and silently truncate
the ones that matter most); putting the button inside each artifact the way the
existing per-row Copy buttons work (every routine would reimplement the chrome,
the sandbox makes clipboard access a fallback dance, and the affordance would
drift in position and wording from tile to tile).
