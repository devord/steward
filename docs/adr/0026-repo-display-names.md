# Repo display names; the account menu is account-scoped

Two consequences of ADR-0023's N-repo model, both about where repo
identity lives in the UI.

**The account menu loses "View data repo".** The entry was a one-repo-era
leftover: it always pointed at the home repo, which with N repos is
ambiguous at best and wrong whenever another group is on screen. The
GitHub jump already lives where it belongs — on each rail group's header
(the access popover's footer link, or the bare hover link when there's
nothing to disclose). The menu is now strictly account-scoped: identity,
Settings, Sign out. Repo-scoped actions render beside the repo they act
on, the same argument that put board deletion in each board's row menu.

**A data repo may carry a display name.** The rail group heading is a
label, and `steward-data-formfactory` as a label is convention noise —
the prefix distinguishes nothing inside an app that only lists data
repos. The name lives in the repo itself, `data/repo.yaml`:

```yaml
name: Form Factory
```

Optional file, optional field; the schema (`repoFileSchema`) is in
`@steward/schema` next to the routines and dashboard files. Storing it in
the repo — not app state — keeps ADR-0001's contract: it's versioned,
and every collaborator sees the same name (a shared repo must not read as
a bare slug to one person and "Form Factory" to another). Precedent:
dashboards already do exactly this with the layout file's `name:`.

Fallbacks and honesty rules:

- Heading = `repo.yaml name` → else "Personal" (home repo) → else the
  short repo name. "Personal" is thus just the home repo's default
  display name, no longer a special case — and a home `name:` overrides it.
- The full `owner/repo` slug stays one hover away: the heading row's
  `title` and the access popover's header keep it, mono, verbatim.
- The name relabels UI only. Identifiers — URLs, action payloads,
  pointer prompts, cloud resource names — never use it.
- Rail order keeps sorting by slug (home first): stable and predictable
  even when display names churn.

Editing is a commit (principle: "save" is a commit): the rename form in
the group's access popover posts to `/data-repos` (`intent: rename`),
which writes `data/repo.yaml` on `main` — or deletes it when the name is
cleared, absent being the honest blank. The affordance shows only with
push permission, but GitHub is the real gate: no push, no commit (403 →
"denied"). The popover otherwise stays indicators-and-a-link (ADR-0023);
the name is the one thing managed there because it is ours, not GitHub's.

Cost: one extra ETag-cached read per repo per sidebar load (`repo.yaml`
alongside the dashboards listing and collaborators). A malformed or
missing file degrades to "no display name", never a failed rail.

Rejected: renaming the GitHub repo itself (churns URLs, checkouts, and
prompts for a cosmetic change); stripping the `steward-data-` prefix
(only helps repos that happen to follow the convention); GitHub's repo
description (it's a description, not a name); app-side storage
(ADR-0001 — and the name wouldn't travel with the repo's readers).
