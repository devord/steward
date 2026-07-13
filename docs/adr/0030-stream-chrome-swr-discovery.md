# Chrome streams; discovery data is served stale-while-revalidate

Loading a board or settings took ~2s: every navigation awaited chains of
live GitHub reads before anything painted. The awaited path was the gate
(`repoExists`/`requireDataRepo`), the board structure, template discovery
(a recursive tree listing plus one read per candidate), and the sidebar
(repo discovery, then boards + collaborators + repo.yaml per repo). The
ETag cache (github.server.ts) makes those reads cheap against the rate
limit, but a 304 revalidation is still a full round trip — the latency
stayed.

**Decision, part 1 — only the board's own structure may sit on the paint
path.** Route loaders await exactly two small file reads (routines.yaml +
the board's layout file, plus the board listing) and stream everything
else, extending the artifact-streaming contract (ADR-0002) to the rest of
the page:

- The **sidebar** streams. The rail renders a skeleton until it resolves,
  then holds the last resolved value across navigations, remounts, and
  poll revalidations (`useStreamed`) so it never flashes back to loading.
  Failures degrade to an empty rail with the quiet incomplete notice —
  the content loader owns the real 401/503 degrade.
- **Templates** stream. Only the add-routine picker reads them, so they
  never gate paint; they're fired after the loader's existence checks so
  a 404 leaves no dangling per-board reads.
- The home route's **existence gate** rides the same parallel wave as the
  structure reads instead of serializing ahead of them.

**Decision, part 2 — discovery data is served stale-while-revalidate**
(swr.server.ts). A cached value is served immediately; once older than
its TTL (60s), a background refresh updates the entry for the _next_
read. Same per-warm-instance scope and lifecycle as the ETag store. Every
in-app mutation that changes what the cache holds invalidates it
explicitly (board create/delete, repo create/register/rename), so the
user's own actions always show on the very next load; the TTL only
bounds how long _someone else's_ out-of-band change can lag.

What may be served stale is bounded: **discovery data whose staleness is
cosmetic** — the sidebar and template discovery today. Config file bodies
and their blob SHAs must never pass through this cache: drafts and the
sync conflict check (ADR-0003) key off exactly what is on main right
now, and the artifact SHA is what clears a pending run (ADR-0016). Both
stay live (ETag-validated) reads.

Consequences:

- First paint waits on one parallel wave of GitHub reads (~300–500ms);
  navigations with a warm SWR cache paint with everything but the two
  config reads served from memory. Widgets keep their per-cell skeletons;
  the rail gains one.
- Background polls (use-poll-revalidate) stop re-paying discovery: a
  poll's sidebar/templates reads are cache hits, cutting both latency
  and API spend.
- SSR of a full document renders the rail skeleton (the held-value map is
  client-only — module state on the server is shared across users and
  must never leak into another viewer's HTML); it fills right after
  hydration.
- A rail can lag out-of-band changes (a collaborator's new board) by up
  to ~2×TTL. Accepted: the rail is chrome.
