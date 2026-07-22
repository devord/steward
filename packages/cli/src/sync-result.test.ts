import { describe, expect, it } from "vitest"

import { parseSyncResult, syncResultProblems } from "./sync-result.ts"

const block = (json: string) =>
  `chatter before\n\`\`\`json steward-sync-result\n${json}\n\`\`\`\n`

const CLEAN = JSON.stringify({
  roster_source: "roster",
  routines: [
    { routine: "steward-corza-pulse", action: "ok" },
    { routine: "steward-corza-gaps", action: "reconciled" },
  ],
  needs_web_ui: [],
})

describe("parseSyncResult", () => {
  it("parses the trailing result block, defaults included", () => {
    const parsed = parseSyncResult(block(CLEAN))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.result.routines[0]).toMatchObject({
      routine: "steward-corza-pulse",
      unresolved: [],
      ambiguous: [],
      drifted: [],
    })
  })

  it("takes the LAST block when the model quoted an earlier one", () => {
    const stale = block(
      JSON.stringify({ roster_source: "roster", routines: [] }),
    )
    const parsed = parseSyncResult(stale + block(CLEAN))
    expect(parsed.ok && parsed.result.routines.length === 2).toBe(true)
  })

  it("fails on a missing block — silence is not convergence (ADR-0046)", () => {
    const parsed = parseSyncResult("all done, everything applied!")
    expect(parsed).toMatchObject({ ok: false })
  })

  it("fails on invalid JSON and on a wrong shape", () => {
    expect(parseSyncResult(block("{nope")).ok).toBe(false)
    const wrong = block(
      JSON.stringify({ roster_source: "vibes", routines: [] }),
    )
    expect(parseSyncResult(wrong).ok).toBe(false)
  })
})

describe("syncResultProblems", () => {
  const expected = ["steward-corza-pulse", "steward-corza-gaps"]

  it("is empty when converged", () => {
    const parsed = parseSyncResult(block(CLEAN))
    if (!parsed.ok) throw new Error("fixture should parse")
    expect(syncResultProblems(parsed.result, expected)).toEqual([])
  })

  it("flags unresolved and ambiguous connectors", () => {
    const parsed = parseSyncResult(
      block(
        JSON.stringify({
          roster_source: "roster",
          routines: [
            {
              routine: "steward-corza-pulse",
              action: "reconciled",
              unresolved: ["Figma"],
              ambiguous: ["Slack"],
            },
            { routine: "steward-corza-gaps", action: "ok" },
          ],
        }),
      ),
    )
    if (!parsed.ok) throw new Error("fixture should parse")
    const problems = syncResultProblems(parsed.result, expected)
    expect(problems).toHaveLength(2)
    expect(problems[0]).toContain("`Figma` not on the roster")
    expect(problems[1]).toContain("`Slack` matches several")
  })

  it("flags needs-web-ui actions and routines missing from the block", () => {
    const parsed = parseSyncResult(
      block(
        JSON.stringify({
          roster_source: "triggers",
          routines: [{ routine: "steward-corza-pulse", action: "ok" }],
          needs_web_ui: [
            "delete steward-old at https://claude.ai/code/routines/x",
          ],
        }),
      ),
    )
    if (!parsed.ok) throw new Error("fixture should parse")
    const problems = syncResultProblems(parsed.result, expected)
    expect(problems).toContainEqual(
      "steward-corza-gaps: not in the result block",
    )
    expect(
      problems.some((p) => p.startsWith("web UI: delete steward-old")),
    ).toBe(true)
  })

  it("does not treat drift as a divergence — it resolved (ADR-0046)", () => {
    const parsed = parseSyncResult(
      block(
        JSON.stringify({
          roster_source: "roster",
          routines: [
            {
              routine: "steward-corza-pulse",
              action: "ok",
              drifted: [{ from: "Google_Calendar", to: "Google-Calendar" }],
            },
            { routine: "steward-corza-gaps", action: "ok" },
          ],
        }),
      ),
    )
    if (!parsed.ok) throw new Error("fixture should parse")
    expect(syncResultProblems(parsed.result, expected)).toEqual([])
  })
})
