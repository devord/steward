/**
 * The artifact kit's public surface (ADR-0050).
 *
 * Everything a routine can reach is re-exported here; anything not exported is
 * an implementation detail the kit may change without a version bump.
 */

/**
 * The kit contract version, stamped into every artifact by `Shell` as
 * `<meta name="steward-kit-version">`.
 *
 * The board injects the *current* `kit.css` over artifacts that may have been
 * published months earlier, so class names are an append-only contract: adding
 * is free, renaming or restructuring is a major bump. The stamp is what lets
 * the board notice a major mismatch and warn instead of rendering something
 * subtly wrong with no commit in the data repo to explain it.
 */
export const KIT_VERSION = "1.0.0"

/** Major component of {@link KIT_VERSION} — what compatibility keys on. */
export const KIT_MAJOR = Number(KIT_VERSION.split(".")[0])

/**
 * The inline inset an artifact takes inside a tile, in px — `Shell`'s
 * `tile:p-2.5` (DESIGN.md § Shape).
 *
 * It is exported because the number does not belong to the kit alone. The
 * board's chrome floats over the artifact with no divider between them, so the
 * widget title, the loading skeleton and the band heading above all have to
 * land on this same edge; that shared edge is the only thing making a frameless
 * heading and a flush body read as one block. Before this constant the number
 * lived as four uncoordinated literals across two packages, the kit moved from
 * the pre-kit `12px 14px` shell to a uniform 10px, and the chrome kept its 14 —
 * a 4px miss on both edges of every tile that no test could see.
 *
 * Read it, don't copy it: `tile-inset.test.ts` in the web app pins the chrome's
 * Tailwind literals to this value, because Tailwind needs class names it can
 * see at build time and cannot take a runtime number.
 *
 * Changing it is a corpus-wide decision, not a local one. Each artifact inlines
 * the kit stylesheet at publish time (`Shell`) and the board only *appends* the
 * current copy, so a rule that exists solely in an old file's inlined sheet has
 * nothing overriding it: raising the inset here would leave every already
 * published artifact at the old value until its routine runs again, while
 * chrome and new artifacts moved. Move the chrome to the artifact, not the
 * other way round.
 */
export const TILE_INSET_PX = 10
