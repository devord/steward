import { describe, expect, it } from "vitest"

import {
  artifactContextMessage,
  extractArtifactContext,
} from "./artifact-context.ts"

const wrap = (inner: string) =>
  `<!doctype html><html><head>${inner}</head><body>x</body></html>`

describe("extractArtifactContext", () => {
  it("reads the block", () => {
    const html = wrap(
      '<script type="text/markdown" id="steward-context">\n## Where it stands\n15d behind.\n</script>',
    )
    expect(extractArtifactContext(html)).toBe("## Where it stands\n15d behind.")
  })

  it("does not care about attribute order", () => {
    const html = wrap(
      '<script id="steward-context" type="text/markdown">hi</script>',
    )
    expect(extractArtifactContext(html)).toBe("hi")
  })

  it("restores escaped closing tags", () => {
    // A briefing that quotes markup would otherwise truncate itself at the
    // first literal </script> — the reason for the escaping rule.
    const html = wrap(
      '<script type="text/markdown" id="steward-context">use `<\\/script>` to close</script>',
    )
    expect(extractArtifactContext(html)).toBe("use `</script>` to close")
  })

  it("strips the indentation an HTML formatter adds", () => {
    // oxfmt indents script content to its depth in the document. Left in
    // place, four spaces make every line a markdown code block.
    const html = `<body>
    <script type="text/markdown" id="steward-context">
      ## Where it stands

      15d behind.

      - a nested item
    </script>
  </body>`
    expect(extractArtifactContext(html)).toBe(
      "## Where it stands\n\n15d behind.\n\n- a nested item",
    )
  })

  it("keeps relative indentation inside the block", () => {
    const html = `<body>
    <script type="text/markdown" id="steward-context">
      ## List
      - top
        - nested
    </script>
  </body>`
    expect(extractArtifactContext(html)).toBe("## List\n- top\n  - nested")
  })

  it("returns null when the artifact carries no block", () => {
    expect(extractArtifactContext(wrap("<title>t</title>"))).toBeNull()
  })

  it("treats a blank block as absent", () => {
    const html = wrap(
      '<script type="text/markdown" id="steward-context">\n\n  \n</script>',
    )
    expect(extractArtifactContext(html)).toBeNull()
  })

  it("ignores other scripts", () => {
    const html = wrap(
      '<script>var a = 1</script><script type="text/markdown" id="steward-context">real</script>',
    )
    expect(extractArtifactContext(html)).toBe("real")
  })
})

describe("artifactContextMessage", () => {
  it("heads the briefing with the name and freshness the card shows", () => {
    const msg = artifactContextMessage("## Gaps\n- one", {
      name: "Ticket Gaps and Drifts",
      ranLabel: "Ran 5h ago",
    })
    expect(msg).toContain("# Ticket Gaps and Drifts")
    expect(msg).toContain("ran 5h ago")
    expect(msg).toContain("## Gaps\n- one")
  })
})
