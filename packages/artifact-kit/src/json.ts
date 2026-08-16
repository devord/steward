/**
 * The JSON tree the chart pipeline walks, named once.
 *
 * A Vega-Lite specification is JSON and nothing more, but neither flint nor
 * the kit has a type for it: `assembleVegaLite` is declared to return `any`,
 * and a form's `decorate` hook restructures whatever it gets. So the value
 * travelling from flint through `decorate` and `finish` into `compileVegaLite`
 * had no contract at all, and the walkers that rewrite it reached for
 * `Reflect.get`/`Reflect.set` — the only way to read a narrowed `object` when
 * the repo forbids type assertions outside tests.
 *
 * Naming the tree removes the whole problem. `isJsonObject` is a real runtime
 * check that hands back an indexable type, so the walkers use ordinary
 * property access, TypeScript checks the writes, and nothing is asserted.
 *
 * These are deliberately *not* Vega-Lite's own types. The kit rewrites keys
 * flint invented and keys Vega-Lite has never heard of (`_kitSize`), at
 * arbitrary depth; a nominal `TopLevelSpec` would reject every one of those
 * edits and buy back nothing, because the spec is only ever validated where it
 * actually matters — when Vega parses it.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | JsonObject

/** An object in that tree. Optional values so a key can be `delete`d. */
export interface JsonObject {
  [key: string]: JsonValue | undefined
}

/**
 * The one place the pipeline asks what a node *is*.
 *
 * Excludes arrays, which every walker handles separately — a Vega-Lite `layer`
 * or `range` is a list to recurse into, never a record to rewrite.
 */
export function isJsonObject(v: JsonValue | undefined): v is JsonObject {
  return isRecord(v)
}

/**
 * The same check, over a value whose declared type is not `JsonValue`.
 *
 * `chartRequests` is handed already-typed blocks, and a block's spec is an
 * *interface* — which TypeScript never gives an implicit index signature, so
 * it is not assignable to `JsonObject` however plain its runtime value is.
 * Intersecting instead of replacing keeps the declared type and adds the
 * indexability, which is what lets a guard confirm a field is really there
 * without an assertion or an `unknown` parameter.
 */
export function isRecord<T>(v: T): v is T & JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

/**
 * A numeric leaf. Used to tell a `fontSize: 10` from a `fontSize: "1.2em"`.
 *
 * `NaN` is rejected: every caller here multiplies or compares the value, and
 * NaN propagates silently through both.
 */
export function isJsonNumber(v: JsonValue | undefined): v is number {
  return typeof v === "number" && !Number.isNaN(v)
}

/** A string leaf. Used to find colour literals in a config tree. */
export function isJsonString(v: JsonValue | undefined): v is string {
  return typeof v === "string"
}

/** A boolean leaf. Used by the document validator for flag fields. */
export function isJsonBoolean(v: JsonValue | undefined): v is boolean {
  return typeof v === "boolean"
}
