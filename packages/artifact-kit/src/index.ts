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
