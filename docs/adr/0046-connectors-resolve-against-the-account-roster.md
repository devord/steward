# Connector names resolve against the account roster, deterministically

ADR-0018 gave routines a `connectors:` allowlist and had `routines:sync`
resolve each name to its account-specific `connector_uuid`/`url` "from the
connectors already on the account's existing triggers", assuming no
connector-list API existed. That assumption is dead, and the mechanism it
forced was quietly dangerous in three ways:

- **Resolution was a judgement call.** The headless apply run eyeballed
  other triggers' `mcp_connections[]` and matched names loosely — `Atlassian`
  in the YAML happened to land on `Atlassian_Rovo` because there was exactly
  one candidate. Two Atlassian workspaces and it attaches one of them,
  silently, possibly wrong.
- **The source was incomplete.** A connector connected on the account but
  attached to no trigger was invisible, so first use needed a one-time
  web-UI seeding on some routine.
- **Failure was invisible.** The "report it as unresolved" instruction
  produced prose that nothing parsed; a sync that silently dropped a
  connector still exited 0.

Meanwhile a Claude Code session _can_ read the account's connected
connectors — name, `connector_uuid`, and `url` — via the schedule tooling's
context, and can drive triggers through the `RemoteTrigger` tool (list, get,
create, update; deletion remains web-UI-only). The names there are the
canonical sanitized forms (`[a-zA-Z0-9_-]`, spaces become hyphens:
`Atlassian-Rovo`, `Google-Calendar`).

## Decision

A `connectors:` entry is a **service requirement**: it names, by canonical
sanitized name, a connector the run needs, and `routines:sync` resolves it
against the **routine's runner's account roster** at apply time. YAML never
carries uuids. Concretely:

- **Vocabulary.** The canonical spelling everywhere in steward (YAML,
  template hints, the wizard catalog, docs) is the roster's sanitized name,
  hyphens included. The schema rejects names outside the charset
  (`connectorNameSchema`); whether a name is _on_ a roster is sync's
  runtime question, never the shared schema's.
- **Resolution.** Normalized equality only — case-insensitive, `-` ≡ `_`
  (healing the pre-0046 underscore spellings) — against roster names. Zero
  matches → `unresolved`; several → `ambiguous`; both reported, never
  guessed, with the routine's other changes still applied. A name that
  resolves only via normalization is additionally reported as drifted, with
  its canonical form; sync stays read-only on `routines.yaml`.
- **Roster source.** The schedule-skill context is primary. If unavailable,
  scraping existing triggers' `mcp_connections[]` is a permitted fallback —
  same match rule, loudly marked (`roster_source: "triggers"`), and safe by
  construction: an incomplete roster can only produce `unresolved`, never a
  wrong attach.
- **Convergence is code-checked.** The headless apply run must end with a
  machine-readable result block (`json steward-sync-result`) that
  `routines:sync` parses. **Exit 0 iff cloud state converged on the plan**:
  an unresolved or ambiguous connector, an orphan pending web-UI deletion,
  a routine the block skipped, or a missing/malformed block all exit 1.
  Silence is not convergence.
- **The wizard catalog ships only directory names.** Directory connectors
  are named identically on every account, so the product may list them;
  account customs (a team's own MCP server — name and URL are user data)
  reach the wizard through the pool-in-use union (`existingConnectors`) and
  the stored-value round-trip instead.

## Considered options

- **Roster + normalized-exact match, result block parsed (chosen).**
- **Keep trigger-scraping as primary.** Status quo minus fuzziness. Rejected:
  keeps the web-UI seeding chore and the invisible-connector blind spot the
  roster removes for free.
- **Provider keys (`atlassian`, `slack`) mapped per account.** Decouples YAML
  from claude.ai naming, but needs a maintained mapping and collapses when
  one provider has two connectors — exactly the ambiguity case that must
  fail loudly, not resolve arbitrarily.
- **Per-account alias map for custom connectors.** No natural home (the
  shared YAML can't hold per-account data; no CLI config file exists), and
  each routine already resolves against exactly one account — its runner's —
  so aliasing buys nothing until a routine changes runners, which is rare
  and loud (`unresolved` on the next sync).

## Consequences

- `Atlassian`-style shorthands stop resolving: not a normalization of any
  roster name, so they come back `unresolved` and the sync exits 1 until the
  YAML says `Atlassian-Rovo`. The old fuzzy path resolved them by luck; the
  red run is the point.
- Pre-0046 underscore spellings (`Google_Calendar`) keep working via
  normalization and nag as drifted until edited.
- Custom connectors stay runner-specific by nature: a shared repo's routine
  naming `Scoro` only resolves for runners whose account has one. That is
  the honest semantics of a service requirement, surfaced per-runner.
- A sync can now stay red for reasons only the web UI can fix (orphan
  deletion, manual-routine creation). Deliberate: an orphan trigger firing
  forever was precisely the ADR-0018 class of silent waste.
- The roster read rides the same research-preview surface as everything
  else here (ADR-0016); if it shifts, the marked fallback keeps syncs
  working while a code fix catches up.
