# Cloud routines carry an explicit repo set and connector allowlist

ADR-0005 made the cloud routine a thin projection of a `routines.yaml`
entry: a stable pointer prompt plus a trigger. That was incomplete. A cloud
run also needs **source repos** (the checkouts it can read) and **MCP
connectors** (the external services it may call), and the YAML said nothing
about either. So `routines:sync`, driving a headless `claude -p` to create
the routine, left both to whatever that session happened to carry — the one
repo it was scoped to, and the runner's entire account connector set.

The result was wrong in both directions at once. Every synced routine came
out with a single source repo (the bulletin app repo) and **all** the
account's connectors. A run needs the opposite shape: usually two or three
specific repos, and only the one or two connectors its skill actually uses.

Concretely, a cloud session **reaches only the repos attached as its
sources** — cross-owner adds are refused at runtime, so a run can't lazily
clone what it's missing. Every run therefore needs, up front:

- the **contract repo** (`Form-Factory/bulletin`) — where run-routine,
  widget-artifact, and publish-widget live, so the pointer prompt resolves;
- the **data repo** — `routines.yaml` and any private `.claude/skills/`;
- the **plugin repo** for a `skill:` that resolves to a plugin skill
  (e.g. `repo-pulse` → `Form-Factory/plugins`).

## Decision

Two optional fields on a routine, projected by `routines:sync` into the
cloud trigger:

- **`repos: [owner/repo, …]`** — _extra_ source repos. `routines:sync`
  always attaches the contract repo and the data repo (it knows both), and
  unions in `repos` on top — base first, so a YAML edit can never drop the
  two repos a run can't start without. Maps to the trigger's
  `job_config.ccr.session_context.sources[]`.
- **`connectors: [Name, …]`** — the MCP allowlist, by the connector's
  account name. **Absent or empty means none** — the run gets zero
  connectors rather than inheriting the account's full set. Maps to
  `mcp_connections[]`; `routines:sync` resolves each name to its
  account-specific `connector_uuid`/`url` from the connectors already on the
  account's existing triggers.

Both are **cloud-only**. A local run reads the machine's checkouts and
inherits its MCP servers (ADR-0012), so the fields are ignored there.

`routines:sync` now reconciles all three axes — cron, repos, connectors —
on every apply, not just the cron. The prompt stays immutable (ADR-0005);
everything else is brought to match the YAML (add missing, remove extras).

## Considered options

- **Explicit `repos` + `connectors`, base auto-unioned (chosen).** The two
  universal repos are never authored (or forgotten); the YAML states only
  what's specific to the routine — its extra repos and its connector needs.
- **Fully explicit repo set.** Every entry lists the contract and data
  repos too. Rejected: pure repetition, and omitting the data repo silently
  breaks the run — a footgun with no upside.
- **Derive everything (infer the plugin repo from the `skill:`).** Least
  authoring, but the sync would need to resolve every skill's origin repo,
  and connector needs can't be derived from a skill name at all. Rejected as
  more machinery than the explicit field it replaces.
- **Leave it to the driving session (status quo).** What produced the bug:
  the routine inherits an accident of whichever session created it.

## Consequences

- Existing synced routines are misconfigured until the next `routines:sync
--apply` (or a hand-fix): they carry one repo and every connector. The
  reconcile step corrects them in place — it trims connectors down to the
  allowlist and adds the missing repos.
- A connector name that resolves to no `connector_uuid` on the account
  (never attached to any trigger) can't be set programmatically; sync
  reports it unresolved rather than guessing, and it's added once in the web
  UI. Same research-preview seam as the API-trigger token (ADR-0016).
- `connectors` defaulting to none means a routine that grows a new external
  dependency must declare it — a run silently losing a connector it relied
  on is louder (an empty result, a visible staleness badge) than the reverse
  over-provisioning, and least-privilege is the safer default for a headless
  run with no human in the loop.
