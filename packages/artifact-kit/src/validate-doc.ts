import { TONES } from "./ui/tone.ts"

const TONE_NAMES: ReadonlySet<string> = new Set(TONES)

/**
 * Check a routine's `data.json` before rendering it.
 *
 * Without this the renderer dereferences required fields directly, so a
 * malformed emit fails as an incidental `Cannot read properties of undefined
 * (reading 'slice')` from inside a minified bundle — which tells the agent
 * that produced it nothing about which field it got wrong. These messages name
 * the field and the path to it.
 *
 * Deliberately hand-rolled rather than zod: the renderer runs as bare `node`
 * in a routine environment with no `node_modules`, and everything it needs
 * here is presence and shape.
 */
export function validateDoc(doc: unknown): string[] {
  const errors: string[] = []
  const isObj = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v)

  if (!isObj(doc)) return ["data.json must be a JSON object"]

  const str = (v: unknown, at: string, required = true) => {
    if (v === undefined) {
      if (required) errors.push(`${at} is required`)
      return
    }
    if (typeof v !== "string" || v === "")
      errors.push(`${at} must be a non-empty string`)
  }

  str(doc.slug, "slug")
  str(doc.title, "title", false)
  str(doc.generatedAt, "generatedAt")
  if (
    typeof doc.generatedAt === "string" &&
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(doc.generatedAt)
  ) {
    // The footer stamp and the meta are both sliced out of this by position.
    errors.push("generatedAt must be ISO-8601 UTC, e.g. 2026-07-30T09:00:00Z")
  }

  // A Set of plain strings, so the membership test needs no assertion —
  // `consistent-type-assertions` is an error in this repo outside tests.
  const tone = (v: unknown, at: string) => {
    if (v !== undefined && !(typeof v === "string" && TONE_NAMES.has(v)))
      errors.push(`${at} must be one of ${TONES.join(", ")}`)
  }

  // One of the two is required, because every artifact has to say something at
  // 340×160 — and only one, because two hero figures at the glance is two
  // glances.
  if (!isObj(doc.stat) && !isObj(doc.verdict)) {
    errors.push(
      "stat or verdict is required — it is what the 1×1 glance renders",
    )
  } else if (isObj(doc.stat) && isObj(doc.verdict)) {
    errors.push("stat and verdict are alternatives — set one, not both")
  } else if (isObj(doc.stat)) {
    if (
      typeof doc.stat.value !== "number" &&
      typeof doc.stat.value !== "string"
    )
      errors.push("stat.value must be a number or a string")
    str(doc.stat.label, "stat.label")
    tone(doc.stat.tone, "stat.tone")
  } else if (isObj(doc.verdict)) {
    const LEVELS = ["good", "attn", "bad", "pending"]
    if (
      typeof doc.verdict.level !== "string" ||
      !LEVELS.includes(doc.verdict.level)
    )
      errors.push(`verdict.level must be one of ${LEVELS.join(", ")}`)
    // The word is not derived from the level: the level picks the colour and
    // the glyph, the routine picks the vocabulary it publishes.
    str(doc.verdict.word, "verdict.word")
    str(doc.verdict.gate, "verdict.gate", false)
    str(doc.verdict.caveat, "verdict.caveat", false)
    str(doc.verdict.note, "verdict.note", false)
    if (doc.verdict.clauses !== undefined) {
      if (!Array.isArray(doc.verdict.clauses))
        errors.push("verdict.clauses must be an array")
      else
        doc.verdict.clauses.forEach((c, i) => {
          const cat = `verdict.clauses[${i}]`
          if (!isObj(c)) return void errors.push(`${cat} must be an object`)
          str(c.value, `${cat}.value`)
          str(c.lead, `${cat}.lead`, false)
          str(c.tail, `${cat}.tail`, false)
        })
    }
  }

  if (doc.blocks !== undefined) {
    if (!Array.isArray(doc.blocks)) errors.push("blocks must be an array")
    else
      doc.blocks.forEach((b, i) => {
        const at = `blocks[${i}]`
        if (!isObj(b)) return void errors.push(`${at} must be an object`)
        if (b.note !== undefined) str(b.note, `${at}.note`, false)
        if (b.rail !== undefined && typeof b.rail !== "boolean")
          errors.push(`${at}.rail must be a boolean`)

        if (b.kind === "prose") {
          if (!Array.isArray(b.items))
            return void errors.push(`${at}.items must be an array`)
          return void b.items.forEach((it, j) => {
            const iat = `${at}.items[${j}]`
            if (!isObj(it)) return void errors.push(`${iat} must be an object`)
            str(it.id, `${iat}.id`)
            str(it.title, `${iat}.title`, false)
            str(it.body, `${iat}.body`)
            str(it.meta, `${iat}.meta`, false)
          })
        }

        if (b.kind !== "queue")
          errors.push(`${at}.kind must be "queue" or "prose"`)
        if (!Array.isArray(b.rows))
          return void errors.push(`${at}.rows must be an array`)
        b.rows.forEach((r, j) => {
          const rat = `${at}.rows[${j}]`
          if (!isObj(r)) return void errors.push(`${rat} must be an object`)
          str(r.id, `${rat}.id`)
          str(r.title, `${rat}.title`)
          if (isObj(r.state)) tone(r.state.tone, `${rat}.state.tone`)
          if (r.values !== undefined && !Array.isArray(r.values))
            errors.push(`${rat}.values must be an array`)
          for (const [k, v] of Object.entries(r.values ?? {})) {
            if (isObj(v)) tone(v.tone, `${rat}.values[${k}].tone`)
          }
        })
      })
  }

  if (doc.provenance !== undefined && !Array.isArray(doc.provenance))
    errors.push("provenance must be an array of strings")
  if (doc.state !== undefined && !Array.isArray(doc.state))
    errors.push("state must be an array of { id, data }")

  return errors
}
