# Publish = git push; render via the contents API, not a URL

Artifacts need a **fixed address known before the first run** (the routine
config references it) and must stay **private**. We chose: artifacts are not
uploaded anywhere. The address is a path convention — data repo, `artifacts`
branch, `w/<slug>/index.html` — publishing is a git push, and the dashboard
fetches the file through the GitHub contents API (the viewer's token works on
the private repo) and renders it in a sandboxed iframe via `srcdoc`
(`sandbox="allow-scripts"`, **no** `allow-same-origin`).

This dissolves the publish-once-to-learn-the-URL chicken-and-egg entirely,
and freshness comes free: the last commit touching the path
(`GET /commits?path=w/<slug>/index.html&sha=artifacts`) is the "ran 2h ago"
footer. Never published → placeholder card.

## Considered options

- **Path convention + API fetch + srcdoc iframe (chosen)** — private by
  default, zero infra, deterministic address, versioned artifacts for free.
- **GitHub Pages** — public unless on Enterprise Cloud (artifacts are
  sensitive), ~1 min deploy latency, 600 s edge cache.
- **raw.githubusercontent.com** — serves `text/plain` (won't render as HTML)
  and caches ~5 min.
- **Gists** — "secret" ≠ private (readable by URL), aggressive caching.
- **Cloudflare Pages/R2 + Access** — a second auth system and infra for zero
  v1 gain.

## Consequences

- One `artifacts` **orphan branch per data repo** serves every routine;
  isolation is by path (`w/<slug>/`), so concurrent publishes can only race
  on fast-forward (publish-widget rebases and re-pushes), never on content.
- Machine-generated commits stay out of `main`'s history, trigger no CI, and
  bypass any branch protection on `main`.
- History grows forever (~1 commit per run). Reads don't care; if size ever
  bites, squash the artifacts branch to depth 1 at the cost of the
  artifact-version-browsing feature.
- External/PIN-gated sharing later = an _additional_ publish target; nothing
  in this model changes.
