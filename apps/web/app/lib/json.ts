/**
 * The JSON tree the app reads from outside itself, named once.
 *
 * Everything crossing the app's boundary arrives as JSON with no type:
 * `JSON.parse` of a stored preference, a `localStorage` read, a mocked GitHub
 * payload, a thrown value caught in a `catch`. Naming the tree is what lets the
 * readers below check a value and get an indexable type back, instead of
 * narrowing with `typeof` at every use site or asserting past the question.
 *
 * Deliberately separate from `@steward/schema`, which types the *data repo's*
 * files and validates them with zod. This is the shape of untrusted input
 * before any schema is applied.
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
 * Whether a value is a non-null, non-array object.
 *
 * Generic over the declared type rather than taking `JsonValue`, because most
 * call sites hold something with a type already — a caught `unknown`, a
 * declared union, an interface TypeScript will never give an implicit index
 * signature. Intersecting keeps what the caller knew and adds indexability.
 */
export function isRecord<T>(v: T): v is T & JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

/** A string leaf. */
export function isJsonString<T>(v: T): v is T & string {
  return typeof v === "string"
}

/** A numeric leaf. Excludes `NaN`, which no caller here means to accept. */
export function isJsonNumber<T>(v: T): v is T & number {
  return typeof v === "number" && !Number.isNaN(v)
}

/** A boolean leaf. */
export function isJsonBoolean<T>(v: T): v is T & boolean {
  return typeof v === "boolean"
}
