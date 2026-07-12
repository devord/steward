# N data repos, discovered by GitHub topic

Supersedes ADR-0010's two-repo model. A user has any number of **data
repos** — each with its own routine pool, dashboards, and templates —
and the app discovers them instead of configuring them: every data repo
carries the GitHub topic **`steward-data`** (env `DATA_REPO_TOPIC`), and
the registry is a topic search run with the viewer's token
(`repos.server.ts`). Search scoping IS the sharing model: results are
exactly the tagged repos the token can read, so granting someone read
access on GitHub is the whole act of sharing a dashboard, and revoking it
is the whole act of unsharing. `BULLETIN_TEAM_REPO` is gone; "the team
repo" is just one shared repo among N (it may live in any org, and
different repos may be shared with entirely different circles).

The **home repo** keeps its naming convention from ADR-0001 —
`<login>/<prefix><login>`, session override allowed — and anchors `/`,
the setup wizard, and the top of the rail. The discovered set is always
`topic search ∪ {home repo}`: the union covers search-index lag on a repo
tagged seconds ago and home repos predating topic support. Repos
generated from the template do **not** inherit its topics, so every
create path (setup wizard, add-data-repo dialog) tags the new repo
explicitly; "register existing" is just adding the tag (push access
required) after verifying `data/routines.yaml` exists.

Server-side, any client-supplied repo passes one gate, `requireDataRepo`:
in the discovered set, or live-verifiably readable **and** tagged (or the
conventional home repo) — otherwise 404, indistinguishable from absent.
Everything after the gate still runs on the viewer's token, so a forged
name can never reach data the token couldn't already read; the gate only
keeps non-data repos out of the product surface. The search call is
cached ~60s per token (the search API allows 30 req/min) and invalidated
by create/register; the ETag layer makes repeats free.

Routes generalize to one canonical shape: `/` = home repo's `main`,
`/r/:owner/:repo/:dashboard` = everything else; legacy `/d/*` and
`/team/*` 301 there. Action payloads (`/sync`, `/run`, `/dashboards`)
name the repo explicitly. Template tiers collapse to two sources:
**built-in** (the product repo bundle, available everywhere) and **this
repo** (scoped to the repo's own boards, shadowing same-named built-ins)
— ADR-0021's discovery mechanics are unchanged.

ADR-0010's `runner:` rule generalizes: a repo is **shared** iff it is not
the viewer's home repo; in a shared repo `routines:sync` enacts only
entries whose `runner` matches the signed-in login. Pointer prompts now
**always** carry the repo clause (amending ADR-0005's personal form) —
_"Run the bulletin routine `<slug>` in `<owner/repo>` — follow the
run-routine skill."_ — because with N repos an unclaused prompt is
ambiguous; the dispatcher still accepts legacy unclaused prompts as
home-repo runs. Cloud resource names carry the owner for shared repos
(`bulletin-<owner>-<slug>`) so two repos' slugs can't collide on one
Claude account; orphan cleanup keys off the prompt's repo clause, as
before.

The UI mirrors the access model instead of wrapping it: each rail group
shows its repo's visibility (lock/globe), a collaborator avatar stack
when GitHub will list one (push access required; degrade to nothing), and
a link out to the repo's access settings. Indicators and a link — GitHub
remains the one place sharing is managed.

Consequences: page loads spend one search call per minute per user plus
one dashboards-listing per repo (ETag-cached); a repo dropped from the
topic disappears from the rail but its data is untouched; a repo shared
with the viewer appears with no app-side action at all. Rejected: a
registry file in the home repo (hand-maintained, and a newly shared repo
wouldn't appear until added), an app database (ADR-0001), and per-path
permissions inside one repo (GitHub has none — the repo boundary stays
the privacy boundary).
