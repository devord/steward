# Changesets

This folder governs versioning and release of the **published** packages —
today just `@devord/steward` (the routines CLI). The web app (`@steward/web`)
and the bundled schema (`@steward/schema`) are private and never published, so
you don't write changesets for them (ADR-0036).

Add a changeset whenever a PR changes the CLI's behaviour:

```bash
pnpm changeset
```

Pick `@devord/steward`, a bump type, and write a one-line summary — it becomes
the changelog entry. On merge to `main`, CI opens a "Version Packages" PR that
applies the bumps; merging _that_ publishes to npm.

Full docs: https://github.com/changesets/changesets
