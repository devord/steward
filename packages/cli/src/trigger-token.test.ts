import { describe, expect, it } from "vitest"

import { checkOwningAccounts } from "./trigger-token.ts"

const WORK = "daniel@formfactory.dev"
const PERSONAL = "daniel@dmoraes.org"

describe("checkOwningAccounts", () => {
  it("passes when every stamped receipt names the signed-in account", () => {
    expect(
      checkOwningAccounts(WORK, [
        { slug: "corza-pulse", account: WORK },
        { slug: "corza-gaps", account: WORK },
      ]),
    ).toEqual({ kind: "ok" })
  })

  it("refuses when a receipt names another account, naming the slugs", () => {
    const verdict = checkOwningAccounts(PERSONAL, [
      { slug: "turtle-beach-hydrogen-pulse", account: WORK },
      { slug: "turtle-beach-hydrogen-stats", account: WORK },
    ])
    expect(verdict).toEqual({
      kind: "mismatch",
      owners: [
        {
          account: WORK,
          slugs: ["turtle-beach-hydrogen-pulse", "turtle-beach-hydrogen-stats"],
        },
      ],
    })
  })

  // The failure this guards against is silent: RemoteTrigger shows the wrong
  // account an empty list, so a mixed set would half-reconcile and half-
  // duplicate. One foreign receipt is enough to stop the whole run.
  it("refuses on a mixed set even though some routines match", () => {
    const verdict = checkOwningAccounts(PERSONAL, [
      { slug: "daily-plan", account: PERSONAL },
      { slug: "corza-pulse", account: WORK },
    ])
    expect(verdict.kind).toBe("mismatch")
    if (verdict.kind !== "mismatch") return
    expect(verdict.owners).toEqual([{ account: WORK, slugs: ["corza-pulse"] }])
  })

  // Receipts predating ADR-0029 (and routines with no trigger yet) carry no
  // account. They can't vote — the --apply backfill stamps them afterwards.
  it("ignores unstamped receipts", () => {
    expect(
      checkOwningAccounts(PERSONAL, [
        { slug: "daily-plan", account: undefined },
        { slug: "corza-pulse", account: undefined },
      ]),
    ).toEqual({ kind: "ok" })
  })

  it("ignores unstamped receipts alongside a matching one", () => {
    expect(
      checkOwningAccounts(PERSONAL, [
        { slug: "daily-plan", account: undefined },
        { slug: "weekly-plan", account: PERSONAL },
      ]),
    ).toEqual({ kind: "ok" })
  })

  it("reports unknown when the signed-in account can't be read", () => {
    expect(
      checkOwningAccounts(undefined, [{ slug: "corza-pulse", account: WORK }]),
    ).toEqual({ kind: "unknown", owners: [WORK] })
  })

  // Nothing stamped and no signed-in account: there is nothing to compare, so
  // don't nag — this is the pre-ADR-0029 world, and it worked.
  it("stays ok with no signed-in account and nothing stamped", () => {
    expect(
      checkOwningAccounts(undefined, [
        { slug: "corza-pulse", account: undefined },
      ]),
    ).toEqual({ kind: "ok" })
  })

  it("is ok with no cloud routines at all", () => {
    expect(checkOwningAccounts(PERSONAL, [])).toEqual({ kind: "ok" })
  })
})
