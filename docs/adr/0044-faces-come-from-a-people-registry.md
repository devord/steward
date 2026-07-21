# Faces come from a people registry, not GitHub's avatar CDN

Every artifact that attributes work to a person opens its rows with that
person's face — repo-pulse's PR queue, repo-narrative's face rail. Widget
standard rule 1 forbids images by URL, so the face has to be bytes inlined into
the file at generation time, which means the run has to fetch it.

Runs kept failing to. Both paths the templates carried — `gh api` against the
`avatar_url` from the users API, and `https://github.com/<login>.png` as a
backstop — terminate at **`avatars.githubusercontent.com`**. A `host: cloud`
run's GitHub access is repository-scoped (ADR-0018) and does not reach that
host, so both attempts fail and every row degrades to an initial. A `host:
local` run, on the machine's own `gh` auth and open network, gets every face.

So this never read as what it is. It looked like flakiness — the same routine
producing faces one run and initials the next — when it is a clean split by
host. An earlier fix (`gh api` promoted over the unauthenticated URL, which is
rate-limited by IP) addressed a real second cause and could not touch this one:
reordering two paths to the same unreachable host still leaves you at that host.

**Decision: a routine may name a `people:` registry, and that registry is the
first place a face and a name come from.** The registry is a JSON map committed
in a git repo, `login → { name, src }`, where `src` is a 48px `data:` URI ready
to inline. Reading it is a file read from a repo the run already mounts as a
source — no network, so it cannot fail by host.

The reference producer is `Form-Factory/people`, a repo whose only job is the
roster: a `github:` login per person, a Slack-sourced photo, a real display
name. `Daniel Moraes`, never the handle `danielmoraes` — and never the default
identicon GitHub serves for someone who never uploaded one. It builds the 48px
map as a committed, CI-drift-checked artifact (`data/avatars-48.json`, 38
people in 53KB) precisely so consumers read one small file instead of
downscaling 4.8MB photos at run time.

**A registry is a repo that exists to be a registry.** The roster was first
curated inside `Form-Factory/certifications`, for that app's own people pages,
and reading it there would have worked. It was still wrong: it makes a
certifications app the org's identity source, so every consumer that wants a
face inherits a dependency on a product it has nothing to do with, and that
app's data model becomes a public contract by accident. A registry other tools
join against is its own concern and gets its own repo.

**The templates stay generic.** `people` is an optional param naming
`owner/repo:path`, not a hard-wired repo: the built-in templates ship to every
data repo (ADR-0021/0023), and a Form Factory roster baked into them would be
wrong everywhere else. A routine with no `people` param behaves exactly as
before.

**GitHub remains the fallback, and initials remain the floor.** The registry
covers the team; it will never cover dependabot, a contractor, or a first-time
outside contributor. So resolution runs registry → `gh api users/<login>` for
the display name (api.github.com is reachable everywhere) → the avatar CDN,
best-effort → the initial circle. Each step is allowed to fail into the next.

What changes is what a failure _means_. An initial used to be indistinguishable
from a broken run; now a face missing for someone **in** the registry is a data
bug with an address (they need a `github:` or an `avatar:` in people.yaml), and
a face missing for someone outside it is expected. Runs report the first and
stay quiet about the second, instead of reporting "avatars unavailable" as one
undifferentiated caveat.

## Considered options

- **Registry repo, derived 48px map, read from a mounted checkout (chosen).**
  Removes the network from the path entirely, reuses a roster someone already
  maintains for other reasons, and upgrades the names as a side effect.
- **Downscale the roster's full-size photos at run time.** Same source, no
  second-repo build — but it needs ImageMagick or `sips` present in the cloud
  sandbox, which is the same species of environment assumption that broke
  avatars in the first place. Rejected: the fix cannot rest on the class of
  guess that caused the bug.
- **A write-through cache in each data repo**, seeded whenever a run can fetch.
  Self-contained, no cross-repo dependency — but it still needs one working
  fetch to seed, so a data repo whose routines only ever run in the cloud never
  gets a first face. It also duplicates a roster that already exists, and
  inherits GitHub's identicons rather than the curated photos.
- **Reference avatars by URL and let the viewer's browser load them.** This
  would work: there is no CSP on the artifact frame, and `sandbox` does not
  block image subresources (the opaque origin only breaks CORS-gated fetches
  like webfonts, which is what ADR-0031 is about). Rejected anyway — it breaks
  rule 1, makes the raw file non-portable, and puts every viewer's IP at
  GitHub on every render of every tile.
- **Give up and standardize on initials.** Cheapest, and honest. Rejected
  because the face rail is load-bearing in both artifacts: repo-narrative reads
  down a human spine by design, and a column of grey capitals is a materially
  worse answer to _who carried this_.

## Consequences

- A routine that sets `people` must also carry that repo in its `repos:` list
  (ADR-0018), **and** the account running it must have access to that repo.
  Registries live in private repos, so neither holds by default and either can
  be revoked without touching the routine. A run in that state falls all the
  way down the chain to initials, which is indistinguishable from a routine
  that set no registry — so a `people` that is set and unreadable is reported
  as a configuration defect rather than absorbed by the fallback.
- **Faces cross a sharing boundary the roster does not.** The registry is
  private; a published artifact is visible to everyone with read on the data
  repo (ADR-0023), and repo-narrative explicitly addresses audiences outside
  the company ("a client's product lead"). So a Slack-sourced photo can reach
  people who cannot see the roster it came from — something GitHub avatars,
  being already public, never did. `people` is opt-in **per routine** for this
  reason and not a global setting: set it on internal boards, leave it off
  where the audience is external and let those faces come from GitHub or stay
  as initials. The decision belongs at the board, because that is where the
  audience is known.
- Steward now has a soft dependency on a producer it does not own. The contract
  is deliberately thin (a JSON map at a path) so any repo can produce one, and
  the fallback chain means a registry that disappears degrades rather than
  breaks.
- The map is a **derived** artifact with a stale-by-construction risk: a new
  hire is faceless until someone regenerates and commits it. The producer's CI
  drift check bounds this to "whenever people.yaml changes", which is when it
  matters.
- 53KB of base64 enters the run's working set and up to ~1.4KB per rendered
  person enters each artifact — unchanged from what inlining already cost, since
  the previous design inlined the same 48px faces when it worked.
