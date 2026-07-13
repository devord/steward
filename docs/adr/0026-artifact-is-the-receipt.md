# Every routine publishes an artifact — the artifact is the receipt

ADR-0024 repositioned routines: they act (open PRs, file reports, tend
repos) and the dashboard is where they report back. That reopens a
contract question: with routines whose natural output is side effects,
is the publish step still mandatory? Should a "tend my repos" routine be
allowed to skip the artifact it has nothing report-shaped to say in?

**Decision: the invariant stands — every run ends in publish** (the
dispatcher's last step, ADR-0002/0005), for acting and reporting routines
alike. What changes is the artifact's job description: it is the
**receipt**, not necessarily the deliverable. For a reporting routine the
receipt is the report itself, as today. For an acting routine the receipt
presents the acts — what was done, what changed, what needs the user
("3 PRs opened · 1 CI failure · 2 awaiting your review"), each item
linking out to where the act lives. The steward persona resolves the
question rather than complicating it: doing the work and presenting the
result are one job — the serve.

Two reasons the invariant is load-bearing, not ceremony:

- **Freshness is the artifact.** "Ran 2h ago", the staleness badge, the
  Update button, dry runs, and the pool view's state vocabulary
  (ADR-0016/0017/0025) are all keyed to the last commit touching
  `w/<slug>/index.html`. An artifact-less routine kind would fork every
  one of those surfaces and require a second freshness mechanism.
- **The artifact is the trust surface.** The product promise is glancing
  instead of digging; a routine that acts silently is invisible — no
  evidence it ran, failed, or needs attention. Automation you can't
  glance at exits the trust loop, which is the whole thing being sold.

Guards on the doctrine:

- **Publish ≠ place.** ADR-0025 already separates the pool from the
  boards: the invariant is "every routine publishes", never "every
  routine is on a dashboard". An orphan routine still writes its receipt;
  placing it is a layout decision.
- **Receipts are deltas, not ceremony.** Templates must author receipts
  around what changed and what needs the user, never a bare "ran OK".
  When a run truly has nothing to say, an honest "Nothing to report —
  checked <when>" is still freshness signal; a receipt that never says
  anything else is a template bug, not an argument against the invariant.

Rejected: optional artifacts (forks freshness and every surface keyed to
it); a separate widget-less "task" routine kind (a second contract for
zero gain — its receipt widget is exactly the glanceable value an acting
routine offers); reporting run metadata outside the artifact, e.g. a run
log the app reads (a parallel reporting channel to build and keep honest
next to the one that already works).
