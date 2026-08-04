# The receipt carries what the run cost

The runs view derives a routine's history from publish receipts (ADR-0033),
and a receipt is a commit: sha, date, author. Nothing in it says what the
run _spent_. The obvious place to ask is the session that spent it — but a
cloud routine's session lives on claude.ai, and the app cannot read it: the
per-routine token is trigger-only by design (ADR-0016). There is no run log
to consult either, because ADR-0026 rejected building one.

So cost has to be written by the run, into the receipt, or it does not
exist.

**Decision: the publish commit carries two trailers**, emitted by
`publish-widget` from the run's own session transcript:

```
publish: shopify-intel

Run-Tokens: 5487635
Run-Cost-USD: 12.1518
```

The run finds its own transcript from `CLAUDE_CODE_SESSION_ID`, an ordinary
environment variable whose value is the transcript's filename, and sums each
assistant message's `usage` per model and per cache tier. The app reads the
trailers back off the commits page it already fetches.

Three properties this shape buys:

- **No new read, no new write.** `listPathCommits` was already fetching each
  receipt and discarding `commit.message`. The trailer is free on both ends:
  no sidecar blob to fetch per row, no second commit, no parallel log.
- **No hook, and therefore no distribution problem.** The session id is in
  the environment, so nothing has to be installed anywhere for a run to
  price itself. A `Stop` hook could compute the same sum, but it fires
  _after_ the publish commit it would annotate, and repo-level hooks live in
  whichever repo the session treats as its project dir — which would have
  meant a `.claude/settings.json` in every data repo (ADR-0010/0023) rather
  than one script in the contract repo.
- **Absence is a resting state.** Every receipt published before this
  predates the trailers, and a run that cannot price itself publishes
  without them on purpose. The column reads as blank, never as free, and the
  total states its own reach rather than passing a partial sum off as whole.

**The figure is imputed and it is a floor.** Cloud runs bill against the
runner's subscription (ADR-0012), where a run has no invoice — only quota
against a daily cap. What the trailer reports is the tokens the run actually
spent, priced at API list rates: the honest shape of "what did this cost",
and not a number anyone was charged. It also undercounts, always in the same
direction, because the sum is taken before the turns that do the publishing.
The UI renders it with a ≈ and says both things on hover. A run whose models
have no entry in the rate table emits the token count alone — tokens stay
true when pricing doesn't.

Cache tiers are the reason this is a real computation rather than two
additions: on a cache-heavy run the writes dominate, and a 1-hour-TTL write
bills at 2× input against a 5-minute write's 1.25×. Pricing every write at
the cheaper tier understated a measured session here by 16%.

Rejected: **a `w/<slug>/run.json` sidecar** — richer (per-model breakdown,
duration) but costs a blob read per row to render one table cell; the
publish commit already rides for free, and the breakdown can move there
later behind a row expansion without changing the column. **A second commit
after publishing** — it would not fabricate a phantom run, since the runs
query filters on `index.html`, but it spends a push on chrome. **Reading the
cost from Anthropic** — there is no such read; that is what ADR-0016 traded
away for a token whose blast radius is quota burn. **Reporting only tokens**
— defensible, and what happens anyway when pricing fails, but it asks every
viewer to do the arithmetic that the runner cares about.
