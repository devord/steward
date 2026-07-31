---
name: slack-post
description: >-
  Post a routine's message to a Slack channel, honouring the dry-run guard,
  mention rules and threading. Use when a routine template composes it, or
  when the user wants a run's finding announced in Slack.
---

# slack-post

The one primitive that **acts**. Everything else in a run can be re-run
freely; a post cannot be un-sent, so this reads its guard before it reads its
message.

No arithmetic, so no script. The caller decides _what_ to say and _whether it
fires_; this decides _how it lands_.

## 1. The guard, first

Post only when **both** hold:

- the run is **not a dry run** (`run-routine` § Dry runs), and
- the caller's own fire rule said to.

On a dry run, or with the rule unfired, **print the message you would have
sent** and stop. A dry run that pings a channel has failed at the only thing
dry runs exist for, and a routine that posts "nothing changed" every morning
trains its channel to mute it.

_Done when_ you have stated, in one line, which branch you took and why.

## 2. Resolve the channel and the people

The caller names a channel (`#corza-alerts` or an id) and, optionally, who to
mention. Resolve each mention to a **member id** — `<@U123ABC>` — via
`slack_search_users` or the channel's member list. A raw `@name` in message
text is plain text: it looks like a mention to the author and notifies nobody.

Someone who cannot be resolved is named in **plain text** and reported in the
reading. Never guess an id, and never silently drop the person: an alert whose
whole point is that a named human must act is worse than useless if it reaches
them as grey text and nobody notices.

## 3. Compose for the channel, not for the widget

Slack is a different surface from a tile, and the caller's data is not its
message. Keep it to what a phone notification can carry:

- **The lead line says the change**, not the state — what crossed, since when,
  and who owns it. A reader who already saw yesterday's post needs the delta.
- **Bullets for items, one line each**, capped. What did not fit goes to the
  widget, and the message links there.
- **Bold sparingly** — Slack's `*bold*`, not markdown's `**`. Its mrkdwn is
  not the markdown a `context` block takes; links are `<url|label>`.

## 4. Post

`slack_send_message` to the channel. To continue an existing conversation
rather than start one, pass the parent's `thread_ts` — a daily escalation
belongs in its own thread, not as a new top-level message each morning.

Record the returned `ts` where the caller can carry it forward. That timestamp
is what makes the next run able to thread, and it belongs in the artifact's
`state` block so `/prior-run` can hand it back.

_Done when_ the send returned a `ts`, or you have reported the failure. A
failed post never fails the whole run — the widget is the durable record and
the post is the notification (ADR-0026).

## 5. Hand back the reading

```
## slack-post — posted

#corza-alerts · ts 1753981200.123456 · threaded under 1753894800.000100
Mentioned: <@U123ABC> Kelly Ruiz, <@U456DEF> Sam Ok
Plain text (unresolved): Renan Paixão
```

or, when the guard held:

```
## slack-post — held

Dry run: nothing sent. The message that would have gone to #corza-alerts:
<the full text>
```
