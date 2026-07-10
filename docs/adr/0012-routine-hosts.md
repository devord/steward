# Routine hosts: cloud by default, launchd for local

ADR-0005 made hosts interchangeable — every host fires the same pointer
prompt — but never said which hosts exist. Some routines can only run where
the data is: time tracking reads local files no cloud environment can see.
Others (project reports) want the cloud: laptop off, claude.ai MCP
connectors, subscription billing.

A routine declares its host in `routines.yaml`: **`host: cloud | local`**,
defaulting to `cloud`.

- **`cloud`** — an Anthropic cloud routine on the runner's account
  (ADR-0005 unchanged): the owner's claude.ai connectors, subscription
  billing, runs with the laptop closed, daily run caps.
- **`local`** — the only host that can read local data, and it inherits the
  machine's `gh` auth and local MCP servers. `routines:sync` grows a local
  half: for each `host: local` routine with a `schedule:` it writes a
  launchd agent (`~/Library/LaunchAgents/co.formfactory.bulletin.<slug>.plist`,
  `StartCalendarInterval`) that fires the identical pointer prompt via
  headless `claude -p`. Same reconciliation discipline as the cloud half:
  the YAML is the source of truth, orphaned plists are deleted.

## Considered options

- **launchd per routine (chosen)** — runs as the user with their keychain
  and `gh` auth, and coalesces missed schedules on wake: the laptop asleep
  at 7am runs the 7am routine when the lid opens — the right semantic for
  "keep the widget fresh."
- **crontab** — silently skips runs while the machine sleeps; a daily-plan
  widget would be stale all day.
- **A single ticker** (one launchd job every ~15 min checking
  `routines.yaml` for due entries) — edit-YAML-and-done with no re-sync,
  but needs last-run bookkeeping; rejected for the extra moving part.
- **GitHub Actions / hosted sandboxes (Vercel, Cloudflare)** — rejected for
  v1 on credentials, not compute: headless CI needs an API key (separate
  billing from the subscription), has no access to the owner's OAuth'd
  claude.ai connectors, and every integration secret must be provisioned by
  hand. The one thing they buy — always-on without Anthropic daily limits —
  the team-VM runner slot from ADR-0005 already covers, running the same
  pointer prompt.

## Consequences

- Headless hosts can't ask questions: an interactive skill (time tracking
  interviews you first) is necessarily `host: local` with no `schedule:` —
  manual-only (ADR-0016).
- **To verify at build time**: claude.ai MCP connectors under headless
  `claude -p` from launchd. If connectors are interactive-session-only,
  scheduled-local routines are limited to local data + `gh` + local MCP
  servers, and mixed routines (daily plans) split their external-services
  half to `cloud`.
- Local schedules exist per machine; a routine synced on one laptop doesn't
  run from another. Acceptable: local routines are personal by nature.
