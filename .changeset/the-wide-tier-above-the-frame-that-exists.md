---
"@devord/steward": patch
---

The wide chart tier fires in the frame that actually exists.

0.3.1 added a `wide` tier so a chart would stop under-filling an expanded
artifact, and cut it at `min-width: 1540px` — above the `max-w-[1500px]` the
lightbox is capped at, so it could never fire in the one place the problem was
reported. The tier was dead code for its own use case.

Cut at 1200px instead, sized from that cap rather than from a guess: the widest
frame an artifact ever gets is 1500px less `main`'s padding, so `page` covers
900–1199 and `wide` covers 1200 up. Worst-case fill across the range goes from
59% to 79%, with no third render added to every chart-bearing artifact.
