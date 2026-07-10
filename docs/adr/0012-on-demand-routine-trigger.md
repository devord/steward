# On-demand routine trigger: opt-in `workflow_dispatch` in the data repo

Scheduled runs fire from a Claude cloud routine (ADR-0005); there is no way
to run a routine _now_ — "Run now" was deferred out of M5. On-demand
execution needs a host that runs the `claude` CLI with skills loaded and can
push the artifact. We do not operate the always-on `@formfactory-dev/runner`
VM that ADR-0005 reserves, and do not want to; Vercel (the web app host) has
no `claude` binary and no persistent Claude auth. So we make **GitHub
Actions the ephemeral executor**, living in the data repo.

A `workflow_dispatch` workflow `.github/workflows/run-routine.yml` ships in
every data repo (personal and team), input `slug`. It:

- **Checks out two repos**: the data repo (config + push target) _and_
  `form-factory/bulletin` at a pinned tag. Skills are not packaged anywhere
  — they exist only in the code repo's `.claude/skills/`, and a run today
  just assumes them ambient (the unbuilt runner is ADR-0005's reserved fix).
  A data-repo-only checkout has `routines.yaml` and the push target but none
  of `run-routine` / `publish-widget` / `widget-artifact` / the per-routine
  skill, so the dispatcher would fail. Dual checkout makes skills explicit
  and version-pinned — the manual path is reproducible where the scheduled
  path still leans on a hand-configured cloud environment.
- **Fires the same stable pointer prompt** as the cron:
  `claude -p "Run the bulletin routine <slug> — follow the run-routine
skill"` (team: with the `in <owner/repo>` clause, ADR-0010). On-demand and
  scheduled runs share one dispatcher path and cannot drift.
- **Publishes unchanged**: `publish-widget` pushes to the checked-out data
  repo's `artifacts` branch (ADR-0002).

**Two gates, both required.** A repo-level `manualRun: false` flag in the
data-repo config (default off; templated in) and the Claude auth secret. An
absent secret is a hard stop, so the capability cannot be switched on
without deliberately adding the credential.

**Credential — the one deliberate divergence.** Scheduled runs store no
credential: they execute on the routine owner's / `runner`'s own Claude
account ("there is no team credential", ADR-0010). An on-demand run cannot
borrow a person's interactive account, so the data repo stores an Anthropic
API key (or a shared-account token) as a GitHub Actions secret. For a team
repo that is an org/shared identity — a scoped exception to ADR-0010's
no-team-credential rule, justified because the trigger is explicit, opt-in,
and rate-limited. This is the only place a data repo holds an execution
credential.

**Trigger surface.** A dashboard "Run now" per widget, shown only when
`manualRun` is true. The web server action dispatches via the user's
existing GitHub OAuth (ADR-0004) — the same identity that commits config
edits — needing `actions:write` on the data repo; no new web-side secret.
The workflow is equally triggerable from the GitHub UI or `gh workflow run`,
so the button is convenience over a working CLI path, not the only path.

**Run lifecycle in the UI.** The button reflects the run: `idle → running →
done/failed`, disabled and labelled "Running…" while in flight, re-enabled
on terminal state. `workflow_dispatch` returns `204` with no run ID, so the
action records the dispatch time and the client polls the Actions API for
the newest `workflow_dispatch` run on the data repo to resolve the run id,
then polls that run's `status`/`conclusion` to completion. "Done" is the
run's `conclusion` (a fresh `w/<slug>/index.html` commit is the corroborating
signal, and the widget's own staleness badge already reflects it). Status is
derived, not persisted — a page reload re-resolves from the Actions API, so
there is no run-state store to keep in sync.

**Rate limiting.** A per-slug `concurrency` group serializes runs (no
overlapping publishes); a cooldown skips a dispatch when the latest
`w/<slug>/index.html` commit is younger than a window (default 5 min),
reusing publish-as-commit history (ADR-0002) as the timestamp — no new
state.

## Considered options

- **GitHub Actions in the data repo (chosen)** — no standing host; GitHub's
  dispatch API is the trigger; credential and button scoped per repo.
- **Always-on runner VM** (`@formfactory-dev/runner`) — truest to ADR-0005
  and would serve scheduled runs too, but requires operating a host we do
  not have.
- **One-shot cloud routine minted on click** — no infra of ours in theory,
  but creating a cloud routine itself goes through the `claude` CLI
  (`routines:sync`), so it still needs a host. Rejected.
- **Workflow in the shared code repo** — would place a personal/team Claude
  credential in the product repo and need cross-repo write to the data repo.
  Rejected, mirroring ADR-0010's rejection of team data in the product repo.

## Consequences

- Enabling manual runs is a two-step opt-in — add the secret, flip the flag
  — done per data repo.
- The workflow pins a `bulletin` ref; a stale pin runs old skills until
  bumped. Pin to release tags and bump deliberately.
- On-demand and scheduled paths diverge in skills delivery (explicit
  dual-checkout vs ambient). Folding the scheduled path onto the same
  workflow is possible later and would make M4 acceptance concrete, but is
  out of scope here.
- Anyone with data-repo (or dashboard) access can spend the stored
  credential's tokens; the flag, cooldown, and GitHub permissions are the
  controls — consistent with the "collaborators see everything" posture of
  ADR-0001 and ADR-0010.
