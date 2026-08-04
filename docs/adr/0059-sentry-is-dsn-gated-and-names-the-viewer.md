# Sentry is DSN-gated and names the viewer

Steward had no runtime visibility. A failure was either absorbed into a
**degrade** — the reader gets "try again", which is the right thing to show
them and tells us nothing — or it crashed the root `ErrorBoundary`, where
nobody heard it. The board is where this hurt most: deferred artifact streams
running against a 30s budget (ADR-0002), a drag gesture doing real layout
maths, and a fit pass measuring inside a sandboxed iframe. All three fail in
ways a screenshot can't explain.

Corza's CORZA-45 is the near neighbour and the shape is borrowed from it, but
not the runtime: that is Hydrogen on Cloudflare, where the SDK has no top-level
init and a client is built per request. Steward is React Router on Vercel Node,
so it gets an ordinary `Sentry.init` and, because `react-router-serve` never
runs there, the serverless direct-import path rather than `--import`. That
caveat is nearly empty here — both incoming requests and outgoing `fetch` are
instrumented through `diagnostics_channel`, and the loader hook only matters
for dependencies that patch modules at import, of which we have none. That
same mechanism settles the question the board raised: the request span ends on
the response's `close`, not when the shell is handed back, so the deferred
artifact reads — the slowest thing the board does, and the reason tracing was
worth having — are inside the trace rather than after it.

Decision, in four parts:

- **The off switch is config, not code.** With no DSN injected the SDK never
  initializes and, on the client, never even downloads — the browser bundle is
  behind a dynamic import gated on a `<meta>` tag the server writes from its
  own environment. So local dev and PR previews are inert by construction, and
  turning an environment on is setting a variable, never shipping a branch.
  Sample rates key off the deploy tier through a table that fails closed: a
  tier nobody deliberately configured collects nothing, errors included. The
  same stance twice — absent configuration means silence, not defaults. What
  that table is sized against is worth recording, because it is not what one
  would guess: the cost of this app's tracing scales with _open tabs_, not
  with people. A board revalidates itself every two minutes while visible and
  each revalidation is most of a hundred spans, so a single board on a wall
  outspends a busy afternoon, and errors — the thing actually worth having —
  are so rare by comparison that they stay unsampled at 1 while traces do not.

- **The session cookie is a credential, and Sentry never sees it.**
  `__steward_session` carries the viewer's GitHub token (ADR-0004). That makes
  redaction the gate rather than the hygiene: cookies and the `authorization`
  header are refused at the SDK's collection options, and refused again in
  `beforeSend`, which also strips query strings wholesale — not per key, so
  that a parameter nobody has thought of yet cannot leak the way `?code=`
  would. Two layers because the first is a library default, and defaults move.

- **Every event names the viewer, and the place.** Everyone past the landing
  page is signed in, so an anonymous crash report would be a self-inflicted
  wound. Events carry the GitHub login as identity — no email, no IP, and the
  display name only as decoration, since older sessions don't have one. But
  _who_ answers less here than _where_: a Steward crash is nearly always one
  repo's config or one routine's artifact, so events also carry the glossary's
  own nouns — data repo, dashboard, routine — derived once in root middleware.
  That middleware writes to the isolation scope the request already has rather
  than opening its own, because a request's transaction is bound to its scope
  at the moment the span opens, before any middleware runs — a fork would tag
  the errors and leave every trace anonymous, which is how this was first
  written and what a local capture of the outgoing envelopes showed. Writing
  in place is only safe while that per-request scope exists, so the middleware
  checks that it does — by the request data stamped on it, the very property
  being relied upon — and forks when it doesn't. A leaked identity would not
  merely be absent; it would name the wrong person.

- **Degrades are Logs, not Issues.** A thrown `Response` is control flow to
  React Router, so the entire degrade path is invisible to error reporting by
  default. Left there, the likeliest real incident this app has — the board
  going 503 for everyone because we spent the hour's GitHub budget — would
  produce no report at all. So the transient branch logs, and the dead-token
  branch stays silent: one is systemic and worth a graph, the other is one
  person's ordinary re-auth. Neither becomes an Issue. An outage we can do
  nothing about should not be able to fill an inbox.

Two blind spots are accepted rather than worked around. Artifact JavaScript
cannot report: the tiles are `srcdoc` iframes with an opaque origin, and that
is ADR-0002/0028's security contract doing its job, not a gap to close. And
Session Replay — kept on for errored sessions only, never for sampled ordinary
ones — will not record widget content either, because replay blocks `srcdoc`
where its masking cannot reach. The escape hatch for that exists and is
deliberately not taken: it would record private repo data unmasked, which is a
worse trade than a grey rectangle. Replay is here for the chrome — the drag,
the dialogs, the rail — and for nothing else.

The narrower stance throughout is the same one: this is a product whose users
are few and named, and who can simply be asked. That is why there is no
crash-report dialog, and why ordinary sessions are not recorded. Corza needs
both because its users are anonymous shoppers who will never write to anyone.
Steward's will send a message before the form loads.
