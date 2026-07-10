# Team dashboards: one org data repo, shared routine pool, N layouts

Personal dashboards stay one-per-user in `<login>/bulletin-data-<login>`
(ADR-0001). Team dashboards add exactly one new place for state: a single
**org-owned team data repo** (env `BULLETIN_TEAM_REPO`, e.g.
`Form-Factory/bulletin-data-team`), with the same two-branch layout as a
personal data repo. GitHub org permissions are the only access control —
anyone who can read the repo sees every team routine, layout, and artifact,
exactly the "collaborators see everything" posture ADR-0001 already takes.

Inside any data repo (personal and team alike):

- `data/routines.yaml` stays one file — the repo's **routine pool**.
- Layouts move to **one file per dashboard**: `data/dashboards/<slug>.yaml`
  (optional `name:` for display). The directory listing is the dashboard
  index; there is no separate index file to drift. `main` is the personal
  default that `/` renders; a data repo predating the migration simply
  shows an empty default board until `data/dashboard.yaml` is moved
  (one commit: `git mv data/dashboard.yaml data/dashboards/main.yaml`).
- Any dashboard may arrange any routine in its repo's pool; artifact paths
  stay `w/<routine-slug>/index.html`, collision-free per repo.

Routes: `/` = personal `main`, `/d/<slug>` = other personal boards,
`/team/<slug>` = team boards, `/team` = index/bootstrap. The server always
derives the repo from the session login or `BULLETIN_TEAM_REPO` — never
from client input. Creating/deleting a dashboard commits its layout file
directly (there is nothing to draft before the route can render); widget
edits keep the draft → sync flow (ADR-0003), whose stale-SHA 409 now also
arbitrates concurrent team editors.

Schedules stay per-user (ADR-0005) — there is no team credential. A team
routine carries a `runner:` field (a GitHub login); that person's Claude
account owns its schedule, and `routines:sync` in the team repo enacts only
entries whose `runner` matches the signed-in `gh` login. Team pointer
prompts carry the repo — _"Run the bulletin routine `<slug>` in
`<owner/repo>` — follow the run-routine skill."_ — so the dispatcher clones
the right repo; personal prompts are unchanged (no clause = personal).
Cloud names are `bulletin-team-<slug>` vs personal `bulletin-<slug>`, but
orphan cleanup matches on the prompt's repo clause, not the name, so
personal syncs can never delete team schedules (and vice versa). A personal
routine slugged `team-x` would collide in name with a team routine `x` —
accepted; the prompt clause still disambiguates cleanup.

Consequences: the runner must have push access to the team repo
(`publish-widget` is unchanged — it pushes wherever the dispatcher checked
out). If a runner leaves the team, their team schedules die with their
account; anyone re-claims a routine by changing `runner:` and re-syncing.
Rejected: team data in the shared product repo (config commits would
trigger CI/deploys and mix histories with code) and one repo per team
dashboard (repo sprawl for no isolation gain — GitHub perms are per-repo
anyway).
