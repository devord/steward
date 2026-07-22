# Skills declare params; routines answer them

> Amended by ADR-0021/0022: the "skills" below became **routine
> templates** (`templates/routines/<id>.md`, referenced by `template:`).
> The params contract itself — `widget.params` declarations, structured
> `params:` answers, the repos union — is unchanged and current.

ADR-0013 made the skill picker an accelerator, but a skill that needs
input had no way to ask for it. `repo-pulse` is the canonical case: its
SKILL.md says the instructions "MUST name the repositories to watch" — a
contract enforced by nothing. The wizard let you add the routine without
naming any repo; the failure surfaced two hops later, as a confused run.
And even when the prompt did name repos, nothing connected them to the
routine's `repos:` source list, so the cloud run often couldn't read the
very repos it was asked to watch (the ADR-0018 footgun).

## Decision

Skills declare **params** in their `widget:` frontmatter; the add-routine
wizard renders them as real form fields; the answers are stored on the
routine as a structured `params:` map.

```yaml
widget:
  artifact: "Open PRs awaiting review, new issues, and CI status per repo"
  params:
    - key: repos
      label: Repositories to watch
      type: repos
      required: true
  connectors: [Atlassian-Rovo]
```

- **Param types v1**: `string` (free text), `select` (one of `options`),
  `repos` (a list of `owner/repo` references). `required` params block the
  wizard's submit while empty.
- **Routine side**: `params:` maps each key to a string (`string`/
  `select`) or a string list (`repos`). The values are opaque to
  `packages/schema` — the contract that types them lives in the skill's
  frontmatter, which the routines file can't see.
- **`repos`-type answers are unioned into the routine's `repos:` field**
  by the wizard at authoring time, so the cloud run is created with read
  access to the repos the skill will query. Authoring time is the only
  place both halves of the contract (frontmatter + YAML) are in one hand;
  `routines:sync` never fetches frontmatter and stays param-agnostic.
- **`widget.connectors`** (sibling hint): connector names the skill's
  runs typically need; picking the skill pre-fills the routine's
  `connectors:` allowlist, which otherwise defaults to none (ADR-0018).
- **Dispatcher**: `run-routine` passes the routine's `params:` to the
  skill alongside `instructions`. A skill that declares params reads them
  from there; instructions stay the free-text brief.

## Considered options

- **Structured `params:` map (chosen).** Edit mode re-renders the same
  fields, required-ness is enforced at authoring, the YAML diff stays
  legible, and `repos` answers can be reliably mirrored into `repos:`.
- **Compose answers into `instructions:` text.** No schema change, but
  answers become unrecoverable prose: edit mode can't re-fill fields,
  validation is impossible, and the repos union would depend on parsing
  English.
- **Per-skill config files in the data repo.** Splits one routine across
  two files for no isolation gain; the diff stops being one hunk.

## Consequences

- `repo-pulse` (plugins repo) declares the `repos` param and drops the
  "instructions MUST name the repositories" convention; other skills opt
  in as they grow inputs.
- A skill edit can rename or retype a param under existing routines. The
  wizard tolerates unknown keys (they round-trip untouched) and missing
  answers (fields render empty); the run degrades exactly as far as the
  skill lets it — same trust model as `skill:` resolution itself.
- Prompt-only routines are unaffected: no skill, no params, wizard
  defaults throughout (ADR-0013).
