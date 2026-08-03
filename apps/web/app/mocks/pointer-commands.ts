import type { BrowserCommand, BrowserCommandContext } from "vitest/node"

/**
 * Real pointer input for the browser project.
 *
 * `userEvent.dragAndDrop` is Playwright's two-move drag: press, jump, release.
 * A grid gesture is nothing like that — the pointer crosses dozens of
 * positions, the cell resnaps under it at every step, and the neighbours
 * recompact each time. Anything that only goes wrong over a continuous
 * gesture (a grip that loses the pointer to the artifact under it, a cell that
 * fights back mid-shrink) is invisible to a two-move drag, so these commands
 * drive Playwright's mouse and CDP touch directly and walk the whole path.
 *
 * The gesture is anchored to an element and expressed as a delta from its
 * centre. Absolute coordinates would have to be mapped out of the test frame's
 * client space into the page's, and getting that mapping wrong fails silently
 * — the press lands somewhere harmless and the test just sees "nothing
 * happened". A locator box is already in page space, so there is nothing to
 * get wrong.
 */

interface Delta {
  dx: number
  dy: number
}

declare module "vitest/browser" {
  interface BrowserCommands {
    mouseDrag(
      selector: string,
      delta: Delta,
      steps?: number,
      hold?: boolean,
    ): Promise<void>
    mouseRelease(): Promise<void>
    touchDrag(selector: string, delta: Delta, steps?: number): Promise<void>
  }
}

interface Point {
  x: number
  y: number
}

/** The element's centre in page coordinates, and the path away from it. */
async function gesture(
  ctx: BrowserCommandContext,
  selector: string,
  { dx, dy }: Delta,
  steps: number,
): Promise<{ from: Point; path: Point[] }> {
  const frame = await ctx.frame()
  const box = await frame.locator(selector).first().boundingBox()
  if (!box) throw new Error(`pointer command: no element for ${selector}`)
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const path = Array.from({ length: steps }, (_, i) => {
    const t = (i + 1) / steps
    return { x: from.x + dx * t, y: from.y + dy * t }
  })
  return { from, path }
}

/**
 * Press the element's centre, travel `delta` over `steps` moves, release.
 *
 * `hold` keeps the button down at the end of the path, which is the only way
 * to see what a gesture looks like while it is happening — the drop
 * placeholder and the lifted card exist for exactly as long as the button is,
 * and both are chrome worth asserting. Pair it with `mouseRelease`.
 */
export const mouseDrag: BrowserCommand<
  [selector: string, delta: Delta, steps?: number, hold?: boolean]
> = async (ctx, selector, delta, steps = 24, hold = false) => {
  const { from, path } = await gesture(ctx, selector, delta, steps)
  await ctx.page.mouse.move(from.x, from.y)
  await ctx.page.mouse.down()
  for (const p of path) await ctx.page.mouse.move(p.x, p.y)
  if (!hold) await ctx.page.mouse.up()
}

/** Let go of a gesture `mouseDrag(…, hold)` left open. */
export const mouseRelease: BrowserCommand<[]> = async (ctx) => {
  await ctx.page.mouse.up()
}

/**
 * The same gesture as one finger. Touch is a different path all the way down —
 * react-draggable binds `touchmove`/`touchend` rather than the mouse pair, and
 * the browser keeps the gesture for scrolling unless the target opts out with
 * `touch-action` — so a passing mouse drag says nothing about a phone.
 */
export const touchDrag: BrowserCommand<
  [selector: string, delta: Delta, steps?: number]
> = async (ctx, selector, delta, steps = 24) => {
  const { from, path } = await gesture(ctx, selector, delta, steps)
  const cdp = await ctx.context.newCDPSession(ctx.page)
  const touch = (p: Point) => [
    { x: p.x, y: p.y, radiusX: 8, radiusY: 8, force: 1, id: 1 },
  ]
  try {
    await cdp.send("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 5,
    })
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: touch(from),
    })
    for (const p of path) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: touch(p),
      })
    }
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    })
  } finally {
    await cdp.detach()
  }
}
