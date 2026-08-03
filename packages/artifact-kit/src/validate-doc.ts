import { TONES } from "./ui/tone.ts"

const TONE_NAMES: ReadonlySet<string> = new Set(TONES)

/** Mirrors DELTA_MARK in QueueTable — an unknown direction renders nothing. */
const DIRECTIONS = ["up", "down", "flat"]

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
          if (c.refs === undefined) return
          if (!Array.isArray(c.refs))
            return void errors.push(`${cat}.refs must be an array`)
          c.refs.forEach((r, k) => {
            const rf = `${cat}.refs[${k}]`
            if (!isObj(r)) return void errors.push(`${rf} must be an object`)
            str(r.label, `${rf}.label`)
            str(r.href, `${rf}.href`, false)
          })
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
        if (b.pageOnly !== undefined && typeof b.pageOnly !== "boolean")
          errors.push(`${at}.pageOnly must be a boolean`)

        if (b.kind === "matrix") {
          if (!isObj(b.spec))
            return void errors.push(`${at}.spec must be an object`)
          const sp = b.spec
          if (!Array.isArray(sp.labels))
            return void errors.push(`${at}.spec.labels must be an array`)
          sp.labels.forEach((l, j) => str(l, `${at}.spec.labels[${j}]`))
          const n = sp.labels.length
          if (!Array.isArray(sp.cells))
            return void errors.push(`${at}.spec.cells must be an array`)
          return void sp.cells.forEach((c, j) => {
            const cat = `${at}.spec.cells[${j}]`
            if (!isObj(c)) return void errors.push(`${cat} must be an object`)
            // An index outside the label set silently addresses no cell, so
            // the pair simply does not appear and the field looks sparser
            // than the data is.
            for (const k of ["a", "b"]) {
              const v = c[k]
              if (
                typeof v !== "number" ||
                !Number.isInteger(v) ||
                v < 0 ||
                v >= n
              )
                errors.push(`${cat}.${k} must be an index into spec.labels`)
            }
            if (typeof c.value !== "number" || !Number.isFinite(c.value))
              errors.push(`${cat}.value must be a finite number`)
          })
        }

        if (b.kind === "day") {
          if (!isObj(b.spec))
            return void errors.push(`${at}.spec must be an object`)
          const sp = b.spec
          // `HH:MM` and nothing else: the grid derives its whole scale from
          // these, and a value it cannot parse positions every block at the
          // top of the day rather than failing.
          const hhmm = (v: unknown, at2: string, req = true) => {
            if (v === undefined) {
              if (req) errors.push(`${at2} is required`)
              return
            }
            if (typeof v !== "string" || !/^\d{1,2}:\d{2}$/.test(v))
              errors.push(`${at2} must be HH:MM`)
          }
          hhmm(sp.from, `${at}.spec.from`)
          hhmm(sp.to, `${at}.spec.to`)
          hhmm(sp.now, `${at}.spec.now`, false)
          if (!Array.isArray(sp.blocks))
            return void errors.push(`${at}.spec.blocks must be an array`)
          const TYPES = ["deep", "meeting", "shallow", "personal", "free"]
          return void sp.blocks.forEach((k, j) => {
            const kat = `${at}.spec.blocks[${j}]`
            if (!isObj(k)) return void errors.push(`${kat} must be an object`)
            str(k.id, `${kat}.id`)
            str(k.label, `${kat}.label`)
            str(k.note, `${kat}.note`, false)
            hhmm(k.start, `${kat}.start`)
            hhmm(k.end, `${kat}.end`)
            if (typeof k.type !== "string" || !TYPES.includes(k.type))
              errors.push(`${kat}.type must be one of ${TYPES.join(", ")}`)
          })
        }

        if (b.kind === "progress") {
          if (!Array.isArray(b.rails))
            return void errors.push(`${at}.rails must be an array`)
          b.rails.forEach((r, j) => {
            const rat = `${at}.rails[${j}]`
            if (!isObj(r)) return void errors.push(`${rat} must be an object`)
            str(r.id, `${rat}.id`)
            str(r.label, `${rat}.label`)
            // Clamped at render, but a non-number is a different mistake: it
            // draws a zero-width fill that reads as "nothing done yet".
            if (typeof r.percent !== "number" || !Number.isFinite(r.percent))
              errors.push(`${rat}.percent must be a finite number`)
            if (
              r.tick !== undefined &&
              (typeof r.tick !== "number" || !Number.isFinite(r.tick))
            )
              errors.push(`${rat}.tick must be a finite number`)
            tone(r.tone, `${rat}.tone`)
            str(r.verdict, `${rat}.verdict`, false)
            str(r.caption, `${rat}.caption`, false)
          })
          if (b.stages === undefined) return
          if (!Array.isArray(b.stages))
            return void errors.push(`${at}.stages must be an array`)
          const STATES = ["done", "now", "next"]
          return void b.stages.forEach((g, j) => {
            const gat = `${at}.stages[${j}]`
            if (!isObj(g)) return void errors.push(`${gat} must be an object`)
            str(g.id, `${gat}.id`)
            str(g.label, `${gat}.label`)
            if (typeof g.state !== "string" || !STATES.includes(g.state))
              errors.push(`${gat}.state must be one of ${STATES.join(", ")}`)
          })
        }

        if (b.kind === "series") {
          if (!isObj(b.spec))
            return void errors.push(`${at}.spec must be an object`)
          const sp = b.spec
          str(sp.from, `${at}.spec.from`)
          str(sp.to, `${at}.spec.to`)
          str(sp.today, `${at}.spec.today`, false)
          if (sp.max !== undefined && typeof sp.max !== "number")
            errors.push(`${at}.spec.max must be a number`)
          if (!Array.isArray(sp.lines))
            return void errors.push(`${at}.spec.lines must be an array`)
          const ROLES = ["hero", "ceiling", "target", "ghost"]
          return void sp.lines.forEach((l, j) => {
            const lat = `${at}.spec.lines[${j}]`
            if (!isObj(l)) return void errors.push(`${lat} must be an object`)
            str(l.id, `${lat}.id`)
            str(l.label, `${lat}.label`)
            if (typeof l.role !== "string" || !ROLES.includes(l.role))
              errors.push(`${lat}.role must be one of ${ROLES.join(", ")}`)
            if (!Array.isArray(l.points))
              return void errors.push(`${lat}.points must be an array`)
            l.points.forEach((pt, k) => {
              const pat = `${lat}.points[${k}]`
              if (!isObj(pt))
                return void errors.push(`${pat} must be an object`)
              str(pt.x, `${pat}.x`)
              // A non-numeric y plots as NaN, which SVG drops silently — the
              // line simply stops, mid-chart, with no error anywhere.
              if (typeof pt.y !== "number" || !Number.isFinite(pt.y))
                errors.push(`${pat}.y must be a finite number`)
            })
          })
        }

        if (b.kind === "throughput") {
          if (!isObj(b.spec))
            return void errors.push(`${at}.spec must be an object`)
          const sp = b.spec
          if (sp.windows !== undefined) {
            if (!Array.isArray(sp.windows))
              errors.push(`${at}.spec.windows must be an array of day counts`)
            else
              sp.windows.forEach((w, j) => {
                if (typeof w !== "number" || !Number.isInteger(w) || w < 1)
                  errors.push(
                    `${at}.spec.windows[${j}] must be a positive whole number of days`,
                  )
              })
          }
          if (!Array.isArray(sp.views) || sp.views.length === 0)
            return void errors.push(
              `${at}.spec.views must be a non-empty array — the first is the one drawn`,
            )
          return void sp.views.forEach((v, j) => {
            const vat = `${at}.spec.views[${j}]`
            if (!isObj(v)) return void errors.push(`${vat} must be an object`)
            str(v.key, `${vat}.key`)
            str(v.label, `${vat}.label`)
            if (!isObj(v.series))
              return void errors.push(`${vat}.series must be an object`)
            const s = v.series
            if (!Array.isArray(s.authors))
              errors.push(`${vat}.series.authors must be an array of keys`)
            // `n` is the axis length and `from` its origin. Getting either
            // wrong does not throw — it silently renders a chart of the wrong
            // length or dated to 1970, which is exactly the class of failure
            // this whole band was migrated out of a frozen template to stop.
            if (typeof s.n !== "number" || !Number.isInteger(s.n) || s.n < 0)
              errors.push(`${vat}.series.n must be a whole number of days`)
            if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s.from)))
              errors.push(`${vat}.series.from must be an ISO date (YYYY-MM-DD)`)
            if (!Array.isArray(s.changed))
              return void errors.push(
                `${vat}.series.changed must be an array of [dayIndex, deltas]`,
              )
            const width = Array.isArray(s.authors) ? s.authors.length : 0
            s.changed.forEach((entry, k) => {
              const cat = `${vat}.series.changed[${k}]`
              if (!Array.isArray(entry) || entry.length !== 2)
                return void errors.push(`${cat} must be [dayIndex, deltas]`)
              const [day, deltas] = entry
              // Past the end of the axis is the same failure as before its
              // start, and quieter: `decodeView` only ever reads `i < n`, so a
              // row dated beyond it is dropped rather than misplaced — that
              // person's work simply never appears.
              if (
                typeof day !== "number" ||
                !Number.isInteger(day) ||
                day < 0 ||
                (typeof s.n === "number" && day >= s.n)
              )
                errors.push(
                  `${cat}[0] must be a day index within the axis (0 to ${String(s.n)} exclusive)`,
                )
              // A short delta row is the encoding bug that reads as a person
              // whose work stopped: the missing tail decodes to zeroes.
              if (!Array.isArray(deltas) || deltas.length !== width)
                return void errors.push(
                  `${cat}[1] must hold one [open, merged, created] triple per author (${width})`,
                )
              // …and inside a triple the same two failures go quieter still.
              // `decodeView` sums straight into a running total, so a string
              // does not throw: `0 += "3"` concatenates, and every later day
              // inherits it. A two-long triple loses `created` to the same
              // silent zero as a short row, one author narrower.
              //
              // One error per row, naming the first offender: a mis-encoded
              // row is usually mis-encoded all the way across, and twenty
              // copies of the same sentence buries the twenty-first.
              const bad = deltas.findIndex(
                (d) =>
                  !Array.isArray(d) ||
                  d.length !== 3 ||
                  d.some((x) => typeof x !== "number" || !Number.isFinite(x)),
              )
              if (bad !== -1)
                errors.push(
                  `${cat}[1][${bad}] must be [open, merged, created] as three finite numbers`,
                )
            })
          })
        }

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
          errors.push(
            `${at}.kind must be "queue", "prose", "series", "throughput", "progress", "day" or "matrix"`,
          )

        // A queue carries either loose rows or labelled groups. Both absent is
        // the shape error worth naming, because the renderer would draw an
        // empty table rather than fail.
        const rows: unknown[] = []
        if (b.groups !== undefined) {
          if (!Array.isArray(b.groups))
            return void errors.push(`${at}.groups must be an array`)
          for (const [k, g] of b.groups.entries()) {
            const gat = `${at}.groups[${k}]`
            if (!isObj(g)) {
              errors.push(`${gat} must be an object`)
              continue
            }
            str(g.id, `${gat}.id`)
            str(g.label, `${gat}.label`, false)
            str(g.count, `${gat}.count`, false)
            if (!Array.isArray(g.rows)) {
              errors.push(`${gat}.rows must be an array`)
              continue
            }
            rows.push(...g.rows)
          }
        } else if (Array.isArray(b.rows)) {
          rows.push(...b.rows)
        } else {
          return void errors.push(`${at} must have rows or groups`)
        }
        rows.forEach((r, j) => {
          const rat = `${at}.rows[${j}]`
          if (!isObj(r)) return void errors.push(`${rat} must be an object`)
          str(r.id, `${rat}.id`)
          str(r.title, `${rat}.title`)
          if (isObj(r.state)) tone(r.state.tone, `${rat}.state.tone`)
          if (r.face !== undefined) {
            if (!isObj(r.face)) errors.push(`${rat}.face must be an object`)
            else {
              // `name` is required because the avatar derives its initial from
              // it. Without this check a face carrying only a src rendered as
              // a thrown "Cannot read properties of undefined" from inside the
              // minified bundle — the incidental failure this whole function
              // exists to turn into a named field.
              str(r.face.name, `${rat}.face.name`)
              str(r.face.src, `${rat}.face.src`, false)
              str(r.face.href, `${rat}.face.href`, false)
            }
          }
          if (r.data !== undefined && !isObj(r.data))
            errors.push(`${rat}.data must be an object of strings`)
          if (r.values !== undefined && !Array.isArray(r.values))
            errors.push(`${rat}.values must be an array`)
          for (const [k, v] of Object.entries(r.values ?? {})) {
            if (!isObj(v)) continue
            const vat = `${rat}.values[${k}]`
            tone(v.tone, `${vat}.tone`)
            // A meter that is not a number renders a bar of width NaN%, which
            // the browser drops — a silently absent bar rather than an error.
            if (v.meter !== undefined && typeof v.meter !== "number")
              errors.push(`${vat}.meter must be a number`)
            if (v.delta === undefined) continue
            if (!isObj(v.delta)) {
              errors.push(`${vat}.delta must be { value, direction }`)
              continue
            }
            str(v.delta.value, `${vat}.delta.value`)
            if (!DIRECTIONS.includes(String(v.delta.direction)))
              errors.push(
                `${vat}.delta.direction must be one of ${DIRECTIONS.join(", ")}`,
              )
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
