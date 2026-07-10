# Manual runs: a runner-owned API trigger, or an interactive local session

Some routines shouldn't run on a cron at all — a report someone refreshes
when they care, or an interactive skill that interviews its owner before
authoring. **`schedule:` becomes optional**; absent means manual-only.
Crossed with `host:` (ADR-0012):

|             | `schedule:` set             | manual-only                        |
| ----------- | --------------------------- | ---------------------------------- |
| **`cloud`** | cloud routine, cron trigger | cloud routine, API trigger only    |
| **`local`** | launchd plist, headless     | nothing to enact — interactive CLI |

**Cloud manual runs.** The runner stays the canonical executor —
ADR-0010's `runner:` generalized from "owns the schedule" to "owns the
cloud resource." That resource carries an **API trigger**
(`POST /v1/claude_code/routines/{id}/fire`) in addition to, or instead of,
a schedule. The per-routine bearer token is **trigger-only scoped** — it
can't read anything; a leak's blast radius is quota burn on the runner's
account. So it lives **in the data repo itself** (ADR-0001 applied
consistently): everyone who can read the repo is exactly the set entitled
to trigger. The app's **Update button fires server-side**: the server reads
the token from the repo _with the clicking user's GitHub token_ — GitHub
proves the entitlement — then POSTs, passing "requested by <login>" in the
fire body's `text` field. No secret in the deploy env, no new access
control, runs as the runner with the runner's connectors.

**Local manual runs.** Zero infrastructure: no plist, no cloud resource,
no token; `routines:sync` skips the entry entirely. The owner runs the
pointer prompt in an interactive terminal session (`pnpm routine <slug>`,
ADR-0017) — which is also the only cell where a skill can ask questions
before authoring, so interactive skills are necessarily manual + local.
On a team routine this is the "clicker's own credentials" case: any
teammate with push access runs it locally and publishes. The Update button
degrades honestly: cloud → fires the trigger; local → copies the one-liner.

## Considered options

- **Runner-owned API trigger + interactive local (chosen).**
- **Per-member trigger resources** — every teammate mints a routine per
  routine; N×M cloud sprawl for the sole benefit of spreading quota burn.
- **workflow_dispatch in the team repo** — any member's GitHub token can
  dispatch, but it reintroduces the CI host rejected in ADR-0012 (API-key
  billing, no connectors). Revisit only if runner quota burn gets real.

## Consequences

- One manual UI step per cloud routine: `/schedule` and the fire API are
  research preview — API triggers can only be created and their token
  minted in the web UI, shown once. `routines:sync` creates the routine,
  then prompts the runner to paste the token and commits it. Expected to
  become automatable; pin the dated beta header
  (`anthropic-beta: experimental-cc-routine-…`) and expect surface change.
- Manual-only routines suppress the staleness badge — there's no cadence to
  be stale against; the footer reads "updated 3d ago · manual".
- Fired runs count against the runner's daily routine cap and subscription,
  same as scheduled runs.
