# A retired routine that never priced a run is not a row

Amends ADR-0061, which said a routine that has left `routines.yaml` "is
still named by its slug and counted — deleting the config entry does not
un-spend the money." That is right, and it stays right for every routine
that spent something. It was too broad for the routines that didn't.

On `steward-data-formfactory` the by-routine list ran to 24 rows, and 7 of
them were retired routines carrying `—` for cost and a `0/n` run count:
`corza-stats`, `bulletin-pulse`, `test-natan`, `knowledge-base-updates`,
`corza-pulse-2`, `nomad-hydrogen-stats`, `turtle-beach-hydrogen-stats`. Half
the list was rows about which the page has nothing to say. They cannot be
clicked (their detail route 404s), they contribute nothing to any dollar
figure, and no one can act on them, because the routine is already gone.

**Decision: `byRoutine` drops a row that is retired _and_ has zero priced
runs.** Both halves are load-bearing:

- **Retired but priced** stays — `turtle-beach-hydrogen-pulse` is ≈$118 and a
  quarter of the window. The money is real and ADR-0061's rule governs.
- **Live but unpriced** stays — `Repository Statistics` at `0/30` is in the
  pool, and "it ran thirty times and never said what it cost" is a finding
  about a routine someone can still fix.

Only the intersection is inert, and dropping it is the difference between a
list of things to look at and a list with history stapled to the bottom.

**The list says what it withheld.** `withheld: { rows, runs }` rides on the
summary and prints under the table: _"7 retired routines that never reported
a price are not listed (55 runs)."_ Their runs stay in the headline's
denominator, because the window's reach did not change — so without that line
the two figures would not reconcile and nothing on the page would explain the
gap. A silently shortened list reads as a complete one; that is the failure
this avoids, and it is the same rule the headline already follows when it
states its own window.

**Not a filter.** ADR-0061 rejected an All/Active control on the grounds that
a viewer-toggled scope makes the headline and the rows disagree. Nothing here
changes that: this is a fixed rule about rows that carry no dollars, so the
total is arithmetically identical either way. There is no state, no control,
and no reading of the page under which the number moves.

Rejected: **dropping every zero-priced row**, retired or not — shorter still,
but it would hide live routines that are silently unpriced, which is the one
thing on this page worth fixing at the source. **Keeping them behind a
disclosure** — honest, and it preserves the click path to nothing; a
disclosure implies there is something under it. **Sorting them to the bottom
and leaving them** — what the page already did, and the state this amends.
