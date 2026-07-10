---
name: publish-widget
description: >-
  Publish a bulletin widget artifact: commit the HTML file to
  w/<slug>/index.html on the data repo's orphan artifacts branch and push
  (ADR-0002). Publishing is a git push — no upload, no CDN. Use as the last
  step of every routine run.
---

# publish-widget

The address is fixed by convention: data repo, `artifacts` branch,
`w/<slug>/index.html`. The dashboard reads it via the contents API and uses
the last commit touching the path as the "ran Xh ago" footer — so one
commit per publish, touching only that path.

## Dry runs (ADR-0017)

When the dispatcher says the run is a **dry run**, publishing means a
local file instead of a push — the live widget must never see a test run:

```bash
OUT="${TMPDIR:-/tmp}/bulletin-dry/$SLUG.html"
mkdir -p "$(dirname "$OUT")"
cp "$ARTIFACT_FILE" "$OUT"
open "$OUT" 2>/dev/null || xdg-open "$OUT" 2>/dev/null || true
```

Report the file path, skip everything below (no fetch, no worktree, no
commit), and note that dry output renders outside the dashboard's
sandboxed iframe (`sandbox="allow-scripts"`, ADR-0002) — sandbox-sensitive
behavior still needs a real publish.

## Steps

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

Concurrent publishes from different routines can only race on
fast-forward — paths are isolated per slug, so content never conflicts. If
the push is rejected (non-fast-forward):

```bash
git pull --rebase origin artifacts
git push origin artifacts
```

Retry up to 3 times; then fail loudly with the git output.

## Rules

- Never commit artifacts to `main`; never touch `data/*.yaml` from here.
- One artifact per publish — don't batch multiple slugs into one commit,
  it corrupts every other widget's freshness footer.
- The file must already satisfy the `widget-artifact` checklist; this skill
  moves bytes, it does not fix content.
- Verify afterwards: `git log -1 --format='%H %cI' origin/artifacts -- "w/$SLUG/index.html"`
  and report that SHA + timestamp.
