---
"@devord/steward": patch
---

Charts fill their frame at every tier, phone included.

Each tier handed Vega a plot rectangle of `budget - 80`, an allowance for axis
and legend chrome about three times what real charts use — the live burn-up
emits 28px of it. So every render gave back ~50px of a budget it was entitled
to, and nothing ever claimed it: `fitToBudget` only shrinks.

The visible cost was worst at the tile size most people read a board at. On a
phone the burn-up drew a 248px plot in a 359px column and looked broken.

The box now sits just under its budget and the fit loop carries the rest, which
is what it is for: a chart with a real legend overflows on the first pass and is
corrected, one without it fills its frame. Measured on the published
`corza-progress` data, the four tiers go from 248/608/808/1108 to
298/658/858/1158 against budgets of 300/660/860/1160.
