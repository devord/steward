---
name: jira-issues
description: >-
  Query Jira and report the issues with their status category, assignee
  account id, fix version, labels and ages — tallied by category, project and
  assignee. Use when a routine template composes it, or when the user asks
  what tickets are open, assigned, done, or how old a queue is.
---

# jira-issues

You reach Jira through the connector; `scripts/enrich.mjs` normalizes the
fields every consumer disagrees about and does the tallying. **Its stdout is
the reading.**

## 1. Reach

Via the Atlassian connector (`searchJiraIssuesUsingJql`, then `getJiraIssue`
for anything needing a changelog). A cloud run has the connector only if the
routine's `connectors:` names `Atlassian-Rovo` and the runner's account
carries it (ADR-0046).

```
project = CORZA AND statusCategory != Done ORDER BY created DESC
```

Two rules the query itself has to carry, because filtering after the fact
still pays the context:

- **Exclude issue types that group work** when the consumer wants a day's
  work — `issuetype not in (Epic)`. An epic is not a task.
- **Ask for the changelog only when a label timestamp is needed.** It is the
  expensive field, and most consumers do not want it.

Write what comes back to `$RUN_DIR/jira-issues/raw.json`, keyed by issue key,
fields as Jira returns them:

```json
{
  "CORZA-198": {
    "key": "CORZA-198",
    "fields": {
      "summary": "…",
      "status": {
        "name": "In Progress",
        "statusCategory": { "name": "In Progress" }
      },
      "issuetype": { "name": "Task" },
      "project": { "key": "CORZA" },
      "assignee": { "displayName": "Mark Cosca", "accountId": "557058:abc" },
      "fixVersions": [{ "name": "1.4", "releaseDate": "2026-08-06" }],
      "labels": ["gated"],
      "created": "2026-06-25T18:23:43Z",
      "updated": "2026-07-29T09:00:00Z",
      "duedate": "2026-08-01"
    },
    "changelog": { "histories": [] }
  }
}
```

A `{"reachable": false}` at the top level records Jira being unreachable —
consumers degrade to their other sources rather than failing.

_Done when_ every key the query returned has an entry.

## 2. Enrich

```bash
node "$STEWARD/.claude/skills/jira-issues/scripts/enrich.mjs" \
  --raw "$RUN_DIR/jira-issues/raw.json" \
  --out "$RUN_DIR/jira-issues" \
  [--now 2026-07-31T09:00:00Z] [--label gated] [--base https://acme.atlassian.net]
```

It writes `issues.json` and prints the reading. What it settles:

- **`statusCategory` is the category's name** — `To Do` / `In Progress` /
  `Done` — never its lowercase key, and `resolved` is `statusCategory ===
"Done"`. Consumers have disagreed about this field twice.
- **Ages** from `created`, and days-to-due from `duedate`.
- **`labelledAt`** — when `--label` is given, the changelog entry that added
  it, and whether the issue carries it today. This is the only reason to pay
  for a changelog.
- **Tallies** by status category, project, assignee and label — resolved
  excluded where a consumer would want it excluded, and counted separately so
  nobody has to re-derive it.

_Done when_ the script exits 0 and `counts.total` matches the keys you wrote.

## Joining faces

Rows carry `assignee.accountId`. Hand those to `/people-registry`, which joins
on the account id — **never on the display name**. Jira and a roster disagree
about a third of a typical team, and a name join fails silently: the people it
drops render as monograms, exactly like people who never uploaded a photo
(ADR-0045).

## Resolved is Jira's word

An issue whose ticket Jira calls Done is `resolved`, whatever a spreadsheet or
a register says about it. Report both and let the consumer decide which is the
population — the disagreement is usually the finding.
