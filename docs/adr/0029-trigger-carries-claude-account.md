# The trigger file names the owning Claude account

ADR-0010's `runner:` is a GitHub login — the right key for the runner
_rule_ (who syncs, who has push access), but it can't distinguish one
person's Claude accounts. A runner with a personal and a work account
(daniel@dmoraes.org vs daniel@theformfactory.co) enacts different routines
under different accounts, and nothing in the system records which; the
pool table's Owner column answers "whose schedule" but not "on which
subscription it burns quota" or "which account's connectors it runs with."

**Decision: the trigger file carries an optional `account:` — the Claude
account email the trigger was minted under.** `data/triggers/<slug>.json`
(ADR-0016) is the enactment _receipt_: it exists only once the cloud
resource does, is rewritten when the routine is re-enacted, and is already
the file the app reads per cloud routine (for `hasTrigger` and the
routine id). Receipts over declarations, consistent with ADR-0026.
`promptTriggerToken` fills it at commit time, defaulting to the machine's
signed-in account (`~/.claude.json` → `oauthAccount.emailAddress`) with a
prompt to override — the runner mints triggers on their own machine, so
the default is almost always right. The pool table shows it beneath the
runner login in the Owner cell.

## Considered options

- **In the trigger file (chosen).**
- **Declared in routines.yaml** (`account:` beside `runner:`) — shows
  before enactment and for local routines, but it's an unverified claim
  that silently drifts when a routine is re-enacted elsewhere, and it
  bloats the declarative file with state.
- **A separate enactment receipt** (`data/enacted/<slug>.json`) — right
  semantics, but a new per-routine file and fetch for one field the
  trigger file already implies.

## Consequences

- The field is optional: triggers committed before this ADR parse fine
  and their rows simply omit the account line. Backfill is a hand edit —
  the token can't be re-read from the web UI, so no tool re-mints the
  file just to stamp the account.
- Local routines show no account. Their runs use whatever account the
  machine's `claude` is signed into at run time; recording that here
  would be a claim, not a receipt.
- The email is repo-visible, like everything else in a data repo
  (ADR-0001) — anyone who can read the repo can already fire the trigger
  on that account's quota; naming the account adds no new exposure.
