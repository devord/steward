# Ticket widgets join faces on the account id, never the display name

ADR-0044 put faces behind a people registry keyed by GitHub login. That covers
every widget built on commits — repo-pulse's PR queue, repo-narrative's face
rail. It covers none of the widgets built on **tickets**, which is why
corza-progress rendered a column of thirty-four grey monograms long after the
registry existed.

A Jira-sourced widget never sees a login. It sees whatever the assignee field
carried, and the registry had no way to be addressed by that.

## Decision

**A registry entry may carry a `jira` account id, and ticket widgets join on
it.** The producer adds `jira: <accountId>` per person in `people.yaml` and
emits it alongside `name` and `src` in the derived map; a widget holding an
assignee matches `assignee.accountId` against it. The map stays keyed by
GitHub login and `jira` rides along as a field, so every existing consumer is
untouched and a person is reachable from either identity space.

**The join key is the account id, and the display name is not a fallback for
it.** This is the whole decision. The name sits in the same payload, reads as
the obvious key, and is wrong: Jira and a Slack-sourced roster disagree about
a third of one team.

| Jira `displayName`              | The roster       |
| ------------------------------- | ---------------- |
| `Mark Cosca`                    | `Mark Dylan`     |
| `Joshua Roxas`                  | `Joshua Gabriel` |
| `John Albert De Guzman Angeles` | `John Angeles`   |
| `Jonas Ivy Imperial`            | `Jonas Imperial` |
| `Renan Lemos`                   | `Renan Paixão`   |

Measured on the CORZA board, a name join resolves 12 of 17 owners. The
failure mode is what condemns it: a dropped owner renders as a monogram, which
is exactly what a person with no photo renders as. It would have looked like it
worked, and the five people it lost would have read as five people who never
uploaded a picture. Email is no better — `Mark Cosca` is
`dylan@theformfactory.co`.

**Photographs stop being categorically out for ticket widgets.**
corza-progress had ruled them out, correctly, on the grounds that rule 1
forbids images by URL and a remote Atlassian avatar would render as a broken
box on every row. That objection was against _remote_ URLs. A registry `src` is
a `data:` URI, so the premise the rule rested on no longer holds. The rest of
that widget's reasoning does still hold, so faces normalize to the same 14px
disc the monogram used and the gate rail stays the loudest thing on the page.

## Considered options

- **Carry the account id in the registry (chosen).** Opaque, immutable, and
  already present in the assignee object any query that requests the field
  receives — so the join costs no extra call and cannot drift when someone
  changes their name.
- **Join on the display name.** No producer change, no schema change, works
  today for two-thirds of the team. Rejected: the third it drops is invisible,
  and an invisible failure in exactly the component ADR-0044 was written to fix
  is not a trade worth making twice.
- **Join on the email address.** Feels stable and is human-readable in a
  hand-edited file. Rejected: it is a display convention, not an identity —
  `Mark Cosca` is `dylan@`, and the local part matching a Slack handle across
  this roster is a coincidence of how accounts were created, not a contract.
- **A second registry keyed by account id.** Cleanest lookup, no field riding
  along. Rejected: two files that must agree about the same person is a drift
  source, and the producer's CI can only check one of them against the roster.
- **Resolve the login from the ticket instead** (Jira → GitHub via commit
  trailers or branch names). Rejected: it makes a face depend on whether
  someone happened to reference the ticket in a commit, which is not true of
  planned or in-progress work — the rows that most need an owner.

## Consequences

- The producer now owns a second identity space. `people.yaml` gains an
  optional `jira`, and the generator rejects a duplicate account id and rejects
  an email in the field — the email being the specific mistake the payload
  invites, since it sits beside the account id and is the readable one.
- **Coverage is partial by construction.** 32 of 38 people carry an account id;
  the rest have no Jira account. An owner the registry does not carry renders
  as a monogram and is silent, consistent with ADR-0044: a missing face is
  reported only when it has an address.
- The derived map is keyed by GitHub login, so a person with a `jira` and no
  `github` is unreachable in it. That is a real gap and today an empty one
  (everyone on the roster commits). The generator names such an entry rather
  than emitting something that reads as configured and resolves to nothing;
  re-keying the file on two identity spaces is a design change, not a patch.
- Widgets that join on the account id inherit ADR-0044's mount requirement
  unchanged: the registry repo must be in the routine's `repos:` and the
  running account must have access, and a `people` that is set and unreadable
  is a configuration defect named in the provenance line.
- The sharing boundary in ADR-0044 applies here too, and bites harder. A
  progress board names every assignee on the project; putting real faces on it
  publishes more of the roster, to whoever can read the data repo, than a PR
  queue does. `people` stays opt-in per routine for this reason.
