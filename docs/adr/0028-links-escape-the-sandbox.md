# Links escape the sandbox: artifacts open their sources in new tabs

An artifact is a digest of objects that live elsewhere — PRs, issues,
calendar events. The tile's job is triage (ADR-0019); the follow-through
("open that PR") belongs to the source system. But the artifact iframes
shipped with `sandbox="allow-scripts"` alone, and in that sandbox a link
click is silently dropped: no popups, no top navigation, nothing.
Routines had no reason to author links, so every digest was a dead end —
the user read a PR number on the board, then went and found it by hand.

Decision, in the standard's two usual layers:

- **Platform**: both artifact iframes (the board tile and the full-view
  lightbox) become
  `sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"`.
  `allow-popups` lets a `target="_blank"` link open a real tab;
  `allow-popups-to-escape-sandbox` makes that tab a normal page instead
  of inheriting the sandbox (a sandboxed github.com won't even run). The
  frame also injects a link guard next to the footer-hide style: a
  capture-phase click listener that stamps `target="_blank"
rel="noopener"` onto any bare `<a href>`, so an artifact that forgets
  the contract degrades to working links, never dead ones.
- **Contract** (widget-standard §7): artifacts carry `target="_blank"
rel="noopener"` on every link themselves. The guard is a backstop —
  the raw artifact page renders with no frame and no guard, and must
  link correctly on its own.

What deliberately stays blocked: in-frame navigation (no
`allow-top-navigation*` — the board never navigates away from itself),
same-origin, and the network. The no-network guarantee is untouched: the
sandbox still blocks fetches and subresources inside the frame; a link
is a user-gesture handoff to a new tab, not a request the artifact makes.

## Considered options

- **Keep links dead, print URLs as text** — zero surface change, but a
  digest that names objects it can't open forces manual lookup for
  exactly the rows that need action. Rejected: the widget's content is a
  to-do list of elsewhere.
- **`allow-top-navigation-by-user-activation`** — links work without new
  tabs, but a click replaces the whole board; a dashboard must survive
  its own links. Rejected.
- **postMessage link protocol** (frame intercepts clicks, parent calls
  `window.open`) — the most control, but invents exactly the protocol
  surface the standard has kept out (ADR-0002: the artifact is a plain
  HTML file, not a client of the board). Rejected; two sandbox flags do
  the same job with zero contract code.

## Consequences

- `rel="noopener"` matters now: the opened tab escapes the sandbox, so
  it must not receive a `window.opener` handle back into the board.
- Popup discipline is the browser's: `window.open` without a user
  gesture hits the popup blocker as on any page; real link clicks are
  unaffected.
- Artifacts published before this ADR get working links through the
  frame guard the moment the board re-renders them — no republish
  needed; their raw pages stay link-less until their routine reruns.
- `data-steward-link-guard` joins the frame's injection vocabulary; like
  the footer hide, it is embed-only.
