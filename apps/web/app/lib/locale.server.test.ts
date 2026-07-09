import { describe, expect, it } from "vitest"

import { getLocale, negotiateLocale } from "./locale.server.ts"

function request(headers: Record<string, string>): Request {
  return new Request("http://localhost/", { headers })
}

describe("negotiateLocale", () => {
  it("honors q-values over list order", () => {
    expect(negotiateLocale("en;q=0.1,pt-BR;q=1")).toBe("pt-BR")
  })

  it("skips unsupported languages and q=0 ranges", () => {
    expect(negotiateLocale("fr, pt;q=0.8")).toBe("pt-BR")
    expect(negotiateLocale("pt-BR;q=0, en;q=0.5")).toBe("en")
    expect(negotiateLocale("fr, de")).toBeUndefined()
  })

  it("treats * as the default and tolerates junk", () => {
    expect(negotiateLocale("fr, *;q=0.1")).toBe("en")
    expect(negotiateLocale("")).toBeUndefined()
    expect(negotiateLocale(";;q=,")).toBeUndefined()
  })
})

describe("getLocale", () => {
  it("prefers a valid cookie over the header", () => {
    const req = request({
      Cookie: "bulletin_locale=pt-BR",
      "Accept-Language": "en",
    })
    expect(getLocale(req)).toBe("pt-BR")
  })

  it("survives a malformed cookie value and falls back to the header", () => {
    const req = request({
      Cookie: "bulletin_locale=%",
      "Accept-Language": "pt",
    })
    expect(getLocale(req)).toBe("pt-BR")
  })

  it("defaults to English with nothing to go on", () => {
    expect(getLocale(request({}))).toBe("en")
  })
})
