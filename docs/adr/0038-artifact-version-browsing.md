# Artifact version browsing: the app renders past runs, git diffs their text

The runs view (ADR-0033) lists a routine's history as publish receipts — one
commit per run touching `w/<slug>/index.html` — and each receipt links out to
its commit on GitHub. But a receipt is a _render_, and GitHub can't show it:
the contents/commit pages serve the artifact as text (ADR-0002 chose the
contents API precisely because raw serves `text/plain`), so "what did last
Tuesday's report actually look like" has no answer without cloning the branch
and opening the file. The app is the only place that renders these files at
all — the sandboxed, theme-injected iframe (ADR-0002/0028) — so it is the only
place a _past_ render can be seen. This was flagged as free from the history
we already keep (M5 backlog: "artifact version browsing").

**Decision: the runs table browses and compares renders; GitHub keeps the
text diff.** On the routine detail view:

- **Browse.** A run's row opens its published artifact at that receipt's
  commit — a resource route
  (`/r/:owner/:repo/routines/:slug/at/:sha`) reads
  `w/<slug>/index.html?ref=<sha>` with the viewer's own token, gated by
  `requireDataRepo` (ADR-0023), and the client frames + sandboxes it exactly
  as the board lightbox does (`frameArtifactHtml`, ADR-0002/0028/0031). Bodies
  are fetched on demand and cached by SHA, so the run list stays one
  commits-API page and a render costs one blob read only when opened.
- **Compare.** A compare mode selects two runs and shows them side by side,
  **older left / newer right**, in the same dialog — the visual answer to
  "what changed between these two runs". The raw line-level diff is not
  rebuilt in-app: the dialog carries a GitHub compare link
  (`/compare/<older>...<newer>`), and every receipt still links to its commit.
  The app renders (its unique job); git diffs text (its unique job).

The receipt link out to the commit (ADR-0033) is untouched — it remains the
inspect-the-text path, now joined by the render path the receipt always
implied.

## Considered options

- **Render on demand, defer text to GitHub (chosen).** Reuses the exact
  framing/sandbox the board already trusts; adds one resource route and zero
  storage; the browsable set is precisely the receipts the view already lists.
- **Build an in-app text or DOM diff.** Duplicates what GitHub's compare view
  already renders well, and misreads the artifact: its value is the rendered
  digest, not its HTML source — a source diff is noise (reordered inline
  styles, regenerated timestamps) around the change that matters, which the
  side-by-side render shows directly.
- **A dedicated `/…/versions` route.** The runs table _is_ the version index
  (one receipt = one version); a route would rebuild that list a second time.
  A dialog keeps the history in view while a render is read.
- **Render every version up front in the loader.** N blob reads per page load
  for versions mostly never opened; the streamed receipts already paint first,
  so lazy per-open is both cheaper and simpler.

## Consequences

- **Only receipts are browsable** — a failed run leaves no commit and no
  render, the same honest gap ADR-0033 draws; session logs stay on claude.ai.
- **Depth-dependent.** This is the feature ADR-0002's watch item named: if the
  artifacts branch is ever squashed to depth 1 to bound growth, history — and
  therefore version browsing — is what that trades away. The tradeoff now has
  a concrete name on both sides.
- **A blob read per opened run**, ETag-cacheable like every other GitHub read;
  a compare is two. Nothing is fetched until a viewer opens a run.
- If a read API for routine runs ever ships (ADR-0033), per-run session links
  slot in beside the render — the receipts, and now their renders, remain the
  freshness truth.
