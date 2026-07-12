# Rename Bulletin → Steward, move to devord/steward

The product is **Steward** and its home is **`devord/steward`**. The old
name described a noticeboard; routines stopped being one milestone ago —
they act (open PRs, file reports, tend repos) and the dashboard is merely
where they report back. A steward is the thing that does the tending. The
move out of the Form-Factory org to Daniel's personal `devord` org happens
in the same breath so every identifier is rewritten exactly once.

The rename is one mechanical sweep, no behavior change:

- Packages: `@bulletin/*` → `@steward/*`.
- Env: `BULLETIN_DATA_REPO_TEMPLATE` / `BULLETIN_DATA_REPO_PREFIX` →
  `STEWARD_*`, prefix default `steward-data-`; `BULLETIN_DATA_DIR` →
  `STEWARD_DATA_DIR`.
- Cookies (`__steward_session`, `steward_locale`) and localStorage/event
  keys (`steward:*`, `steward-appearance`) renamed **without migration**:
  sessions just re-login, and drafts are disposable by design (ADR-0003).
- Pointer prompt (ADR-0005, amended by ADR-0023): _"Run the steward
  routine `<slug>` in `<owner/repo>` — follow the run-routine skill."_
- Contract repo: `devord/steward`; launchd labels `org.devord.steward.*`;
  cloud resource names `steward-<slug>` / `steward-<owner>-<slug>`;
  script cache `~/.cache/steward`; logs `~/Library/Logs/steward`.

Unchanged, deliberately: the discovery topic `steward-data` (ADR-0023
already picked the final name), the artifact contract (`w/<slug>/index.html`
on the orphan `artifacts` branch, ADR-0002), and the skill names
`run-routine` / `widget-artifact` / `publish-widget` — the contract
surface routines and data repos depend on survives the rename intact.

Frozen prompts are the one real migration cost: cloud routines enacted
before the rename carry the old phrase verbatim (ADR-0005 — prompts are
stable by design). The dispatcher therefore keeps accepting "Run the
bulletin routine …" as a legacy alias during migration — the single
permitted residual of the old name outside historical ADRs — and the
migration runbook recreates existing cloud routines under the new names
rather than editing them in place.

Prior ADRs keep their original wording; they are records, not living docs.
