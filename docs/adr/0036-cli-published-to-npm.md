# The routines CLI ships on npm; the web app stays private

To _use_ Steward a person needs two things beyond the hosted app: the routines
CLI — to enact their routines onto their own Claude account and this machine —
and the data-repo template. The web app itself has no such requirement on the
user: it's a stateless renderer over their GitHub token (principle: "your data
is yours"), so it can stay a private, closed product. But the CLI can't: it
runs on the user's machine. If it only lived in the private monorepo, nobody
could get it.

The CLI enacts things on the user's Claude account and installs launchd agents,
which is a fair reason someone might want to _read_ it before running. We
weighed that and chose the lighter bar: users need it **runnable**, not
auditable. Availability, not open-source.

**Decision: publish exactly one public package, `@devord/steward`, to npm;
keep everything else private.** `npx @devord/steward sync` (and `run`,
`trigger`) is the whole distribution. The web app (`@steward/web`) and the
shared schema (`@steward/schema`) never publish.

**One package, schema bundled.** The CLI lives in `packages/cli` and its build
(`esbuild`, `build.mjs`) inlines everything — including the private
`@steward/schema` — into a single `dist/cli.js`. The published package has no
workspace dependencies and nothing to resolve under `npx`; schema stays private
without a second published surface to version. Ship raw TypeScript was
rejected: `npx` consumers may be on a Node that doesn't strip types, and it
would drag the private schema import along.

**Contract skills travel with the package.** `run` and the launchd plists
`sync` writes both pass `claude --add-dir <dir>` so the contract skills
(`run-routine`, `widget-artifact`, `publish-widget`) resolve — the data-repo
cwd doesn't carry them (ADR-0014). In the monorepo that dir was the checkout;
an installed CLI isn't a checkout. So the build copies those three skills into
the package (`skills/.claude/skills/`), and `skills.ts` resolves them relative
to the install (falling back to the repo root when running from source in dev).

**Consequence: scheduled-local needs a global install.** A launchd plist
persists an _absolute_ `--add-dir` path, so it must point at a stable location
— `npm i -g @devord/steward`, not an ephemeral `npx` cache that can be garbage
collected. Cloud routines and interactive `run` work fine under `npx`; only the
launchd (scheduled-local) path requires the global install. Documented at the
point of use.

**Changesets governs releases.** `.changeset/` + a CI split (a non-blocking
changeset reminder on PRs, a `changesets/action` publish on `main`) version and
publish `@devord/steward`. This borrows the config shape from the sibling
`flow` repo, but where flow only _versions_ internally, here it actually
`changeset publish`es. `@steward/web` is in `ignore`; private packages are
never published regardless. No npm provenance — it requires a public source
repo, and this monorepo stays private; that's the trade for a private product.

**Distribution stays private-repo-friendly.** The public artifact is a built
tarball on npm — the source repo can stay private. A separate _public_ CLI repo
was rejected: it would serve auditability we decided we don't need, at the cost
of a second repo and cross-repo schema versioning. The npm org (`@devord`) and
the `NPM_TOKEN` CI secret are provisioned out of band.

Not yet shipped: a `steward init` that scaffolds a data repo from the template.
The template (`templates/data-repo/`) is distributed by the app and git for
now; bundling it into the CLI is a later step, not this decision.
