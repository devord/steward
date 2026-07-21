---
name: publish-widget
description: >-
  Publish a steward widget artifact: commit the HTML file to
  w/<slug>/index.html on the data repo's orphan artifacts branch and push
  (ADR-0002). Publishing is a git push, with no upload and no CDN. Use as
  the last step of every routine run.
---

# publish-widget

The address is fixed by convention: data repo, `artifacts` branch,
`w/<slug>/index.html`. The dashboard reads it via the contents API and uses
the last commit touching the path as the "ran Xh ago" footer, so make one
commit per publish, touching only that path.

## Dry runs (ADR-0017)

When the dispatcher says the run is a **dry run**, publishing means a
local file instead of a push. The live widget must never see a test run:

```bash
set -euo pipefail   # a failed copy must fail the run, not open stale output
printf '%s' "$SLUG" | LC_ALL=C grep -Eqx '[a-z0-9]+(-[a-z0-9]+)*' || { echo "bad slug: $SLUG" >&2; exit 1; }
OUT="${TMPDIR:-/tmp}/steward-dry/$SLUG.html"
mkdir -p "$(dirname "$OUT")"
cp "$ARTIFACT_FILE" "$OUT.tmp" && mv "$OUT.tmp" "$OUT"
open "$OUT" 2>/dev/null || xdg-open "$OUT" 2>/dev/null || true
```

If any step before the `open` fails, stop and report the failure. Never
open a pre-existing `$OUT` from an earlier run as if it were this run's
output. Report the file path, skip everything below (no fetch, no
worktree, no commit), and note that dry output renders outside the dashboard's
sandboxed iframe (`sandbox="allow-scripts"`, ADR-0002), so sandbox-sensitive
behavior still needs a real publish.

## Steps

The slug comes from YAML someone edited, so validate it before it touches a
path (kebab-case only; anything else could escape `w/`):

```bash
printf '%s' "$SLUG" | LC_ALL=C grep -Eqx '[a-z0-9]+(-[a-z0-9]+)*' || { echo "bad slug: $SLUG" >&2; exit 1; }
```

The artifact is checked here too, not only by the caller. This is the one
step that reaches the live widget, and whatever gets past it is what the
board shows until the next run, so the gate belongs here rather than in the
instructions of whoever called:

```bash
[ -s "$ARTIFACT_FILE" ] || { echo "refusing to publish an empty artifact" >&2; exit 1; }
LC_ALL=C grep -q '</html>' "$ARTIFACT_FILE" || { echo "artifact is truncated (no </html>)" >&2; exit 1; }
node "$STEWARD/.claude/skills/widget-artifact/scripts/validate.mjs" "$ARTIFACT_FILE" || exit 1
```

`$STEWARD` is the steward checkout `run-routine` resolved. A run that can't
produce a file the validator passes reports that and publishes nothing: a
stale widget wearing its staleness badge is the honest failure, a published
broken one is not.

Work in a temporary worktree so the data repo checkout (on `main`) is
untouched:

```bash
cd "$DATA_REPO"          # the checkout run-routine resolved
git fetch origin artifacts 2>/dev/null && EXISTS=1 || EXISTS=0

WT=$(mktemp -d)/artifacts
if [ "$EXISTS" = 1 ]; then
  git worktree add "$WT" origin/artifacts --detach
  cd "$WT" && git switch -C artifacts
else
  # First publish ever: the branch is an ORPHAN — no shared history with
  # main, so machine commits never pollute main's log (ADR-0002).
  git worktree add "$WT" --detach
  cd "$WT" && git checkout --orphan artifacts && git rm -rfq . 2>/dev/null || true
fi

mkdir -p "w/$SLUG"
cp "$ARTIFACT_FILE" "w/$SLUG/index.html"
git add "w/$SLUG/index.html"
git commit -m "publish: $SLUG"
git push origin artifacts
```

Clean up the worktree afterwards: `git worktree remove "$WT" --force`.

## The push race

Concurrent publishes from **different** routines can only race on
fast-forward, since paths are isolated per slug, so content never
conflicts. (Two runs of the _same_ routine are a different matter — they
write the same path, and a rebase would replay one over the other. That is
a scheduling problem; publishing cannot pick the right winner, so let the
rebase conflict stand and report it.) If the push is rejected
(non-fast-forward):

```bash
git pull --rebase origin artifacts
git push origin artifacts
```

Retry up to 3 times; then fail loudly with the git output.

## Rules

- Never commit artifacts to `main`; never touch `data/*.yaml` from here.
- One artifact per publish. Don't batch multiple slugs into one commit;
  it corrupts every other widget's freshness footer.
- **Publish once per run**, as the final step. Successive publishes of one
  slug overwrite each other, so a draft shipped mid-run is live on the
  board until the next one lands, and the run's _last_ word wins even when
  an earlier draft was the better one. Author, validate, then publish once;
  never publish to see how something looks — that's what a dry run is for.
- The file must already satisfy the `widget-artifact` checklist; this skill
  moves bytes, it does not fix content.
- Verify afterwards: `git log -1 --format='%H %cI' origin/artifacts -- "w/$SLUG/index.html"`
  and report that SHA + timestamp.
