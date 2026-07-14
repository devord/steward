import { describe, expect, it } from "vitest"

import {
  parseRoutineTemplate,
  templateKind,
  widgetMetaSchema,
} from "./template.ts"

describe("widgetMetaSchema", () => {
  it("accepts the full hint shape", () => {
    const result = widgetMetaSchema.safeParse({
      artifact: "One-line description of what the artifact shows",
      sizes: { default: { cols: 2, rows: 1 }, min: { cols: 1, rows: 1 } },
      schedule: "0 8 * * *",
    })
    expect(result.success).toBe(true)
  })

  it("needs only the artifact line — sizes and schedule are hints", () => {
    const result = widgetMetaSchema.safeParse({ artifact: "x" })
    expect(result.success).toBe(true)
  })

  it("rejects a sizes block without a default", () => {
    const result = widgetMetaSchema.safeParse({
      artifact: "x",
      sizes: { min: { cols: 1, rows: 1 } },
    })
    expect(result.success).toBe(false)
  })

  it("parses params, defaulting type and required (ADR-0020)", () => {
    const result = widgetMetaSchema.parse({
      artifact: "x",
      params: [
        { key: "repos", label: "Repositories to watch", type: "repos" },
        { key: "focus", label: "Focus" },
      ],
      connectors: ["Google_Calendar"],
    })
    expect(result.params?.[1]).toMatchObject({
      type: "string",
      required: false,
    })
  })

  it("rejects a select param without options and duplicate keys", () => {
    const select = widgetMetaSchema.safeParse({
      artifact: "x",
      params: [{ key: "lens", label: "Lens", type: "select" }],
    })
    expect(select.success).toBe(false)
    const dupes = widgetMetaSchema.safeParse({
      artifact: "x",
      params: [
        { key: "repos", label: "A", type: "repos" },
        { key: "repos", label: "B" },
      ],
    })
    expect(dupes.success).toBe(false)
  })
})

const TEMPLATE_MD = `---
name: daily-plan
description: Produce today's working plan as a steward widget artifact.
widget:
  artifact: "Today's plan: top 3 priorities, time blocks, and carry-overs"
  sizes:
    default: { cols: 2, rows: 2 }
  schedule: "0 8 * * *"
---

# Daily plan
`

describe("parseRoutineTemplate", () => {
  it("reads a routine template's frontmatter", () => {
    const template = parseRoutineTemplate("daily-plan", TEMPLATE_MD)
    expect(template).toMatchObject({
      id: "daily-plan",
      name: "daily-plan",
      widget: { schedule: "0 8 * * *" },
    })
  })

  it("returns null for a file without a widget block", () => {
    const md = "---\nname: x\ndescription: not a routine template\n---\nbody"
    expect(parseRoutineTemplate("x", md)).toBeNull()
  })

  it("returns null instead of throwing on broken frontmatter", () => {
    expect(parseRoutineTemplate("x", "---\n{{nope\n---\n")).toBeNull()
    expect(parseRoutineTemplate("x", "no frontmatter at all")).toBeNull()
  })

  it("tolerates CRLF line endings and a BOM in the frontmatter", () => {
    const crlf = TEMPLATE_MD.replaceAll("\n", "\r\n")
    expect(parseRoutineTemplate("daily-plan", crlf)?.id).toBe("daily-plan")
    expect(parseRoutineTemplate("daily-plan", "\uFEFF" + TEMPLATE_MD)?.id).toBe(
      "daily-plan",
    )
  })

  it("rejects a non-kebab-case template id", () => {
    const md = `---\ndescription: d\nwidget:\n  artifact: a\n---\n`
    expect(parseRoutineTemplate("Daily Plan", md)).toBeNull()
  })

  it("reads declared params from the widget block (ADR-0020)", () => {
    const md = `---
description: d
widget:
  artifact: a
  params:
    - key: repos
      label: Repositories to watch
      type: repos
      required: true
---
`
    const template = parseRoutineTemplate("repo-pulse", md)
    expect(template?.widget.params).toEqual([
      {
        key: "repos",
        label: "Repositories to watch",
        type: "repos",
        required: true,
      },
    ])
  })

  it("reads subjectParam and kind from the widget block (ADR-0040)", () => {
    const md = `---
description: d
widget:
  artifact: a
  subjectParam: repos
  kind: pulse
  params:
    - key: repos
      label: Repositories to watch
      type: repos
      required: true
---
`
    const template = parseRoutineTemplate("repo-pulse", md)
    expect(template?.widget.subjectParam).toBe("repos")
    expect(template?.widget.kind).toBe("pulse")
  })
})

describe("templateKind (ADR-0040)", () => {
  const make = (id: string, kind?: string) => ({
    id,
    name: id,
    description: "d",
    widget: { artifact: "a", ...(kind ? { kind } : {}) },
  })

  it("prefers an explicit kind", () => {
    expect(templateKind(make("repo-pulse", "heartbeat"))).toBe("heartbeat")
  })

  it("defaults to the template id's last hyphen segment", () => {
    expect(templateKind(make("repo-pulse"))).toBe("pulse")
    expect(templateKind(make("ci-status-watch"))).toBe("watch")
  })

  it("falls back to the whole id when it has no hyphen", () => {
    expect(templateKind(make("digest"))).toBe("digest")
  })
})
