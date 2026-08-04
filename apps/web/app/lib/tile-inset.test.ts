import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { TILE_INSET_PX } from "../../../../packages/artifact-kit/src/index.ts"
import { Shell } from "../../../../packages/artifact-kit/src/Shell.tsx"
import { WidgetSkeleton } from "../components/widget-skeleton.tsx"

import { bandIndentCls, tileInsetCls } from "./utils.ts"

/**
 * The tile's shared left edge, held across the two packages that draw it
 * (DESIGN.md § Shape).
 *
 * A board cell has no fill: the artifact paints flush to the board and the
 * widget title bar floats directly on it with no divider between them. The only
 * thing making those read as one block is that they start on the same edge — so
 * the artifact's inset (`@steward/artifact-kit`) and the chrome's (this app)
 * are one number wearing two hats, in two packages, in two different styling
 * systems.
 *
 * Nothing enforced that, and it drifted exactly as you'd expect: ADR-0050 moved
 * artifacts from the pre-kit `12px 14px` shell to a uniform 10px, the chrome
 * kept its 14, and for the kit's whole life every tile was 4px out on both
 * edges — with the skeleton 4px out too, so each artifact visibly lurched left
 * as it painted. Every test in both packages passed throughout, because no test
 * looked at both packages at once. This one does.
 *
 * The chrome cannot simply read the constant at runtime: Tailwind needs class
 * names it can see at build time. So the literals stay literals and this test
 * is what keeps them honest.
 */
describe("the tile's shared left edge", () => {
  /** Tailwind's spacing scale is 4px per step — `p-2.5` is 10px. */
  const step = (px: number) => px / 4

  it("is what the kit's own shell actually renders", () => {
    const html = renderToStaticMarkup(
      Shell({
        slug: "x",
        generatedAt: "2026-08-03T00:00:00Z",
        css: "",
        children: null,
      }),
    )
    // Rendered, not grepped: `TILE_INSET_PX` documents the artifact's inset,
    // and this is the assertion that it *is* the artifact's inset rather than
    // a stale note beside a literal that moved on without it.
    expect(html).toContain(`tile:p-${step(TILE_INSET_PX)}`)
  })

  it("is the inset the chrome floating over the artifact takes", () => {
    expect(tileInsetCls).toBe(`px-${step(TILE_INSET_PX)}`)
  })

  it("adds the cell's 1px frame for the band heading outside it", () => {
    // The band heads the widget *titles*, which sit inside the cell's border
    // while the heading sits outside it. That one pixel is the whole of the
    // difference — any other gap means the heading stopped holding the column
    // its own children hold.
    expect(bandIndentCls).toBe(`pl-[${TILE_INSET_PX + 1}px]`)
  })

  it("is worn by the skeleton, so the swap to a real artifact doesn't slide", () => {
    const html = renderToStaticMarkup(
      WidgetSkeleton({
        widget: {
          routine: "x",
          position: { col: 1, row: 1 },
          size: { cols: 1, rows: 1 },
        },
      }),
    )
    // Both of the skeleton's boxes: the bar standing in for the title, and the
    // body standing in for the artifact. A skeleton that agrees with the title
    // bar but not the artifact still lurches — it just lurches later.
    const worn = html.split(tileInsetCls).length - 1
    expect(worn).toBe(2)
  })
})
