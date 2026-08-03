import { useCallback, useState } from "react"

import type { Routine, Widget } from "@steward/schema"
import {
  type LayoutItem,
  ResponsiveGridLayout,
  useContainerWidth,
  verticalCompactor,
} from "react-grid-layout"
import { describe, expect, it } from "vitest"
import { commands, page, userEvent } from "vitest/browser"
import { render } from "vitest-browser-react"

import "../app.css"
import {
  RESIZE_HANDLES,
  settledRect,
  widgetsToLayout,
} from "../lib/rgl-layout.ts"
import { DEFAULT_DARK_THEME, themeStylesheet } from "../lib/theme.ts"
import { WidgetCard } from "./widget-card.tsx"

const THEME_STYLESHEET = themeStylesheet()
document.documentElement.dataset.theme = DEFAULT_DARK_THEME

// The board's grid wired exactly as dashboard-board.tsx does it (ADR-0041):
// react-grid-layout with vertical compaction, controlled by a widgets array
// the commit path folds RGL's settled layout back into.
const COMPACTOR = verticalCompactor

// The harness pins the grid container to this width by default, so cell widths
// are deterministic across breakpoints.
const CONTAINER_WIDTH = 1200
// A phone viewport, below the 700px `sm` breakpoint — one column.
const PHONE = 600

function GridHarness({
  initial,
  editing = true,
  columns = 4,
  html,
  boardWidth = CONTAINER_WIDTH,
}: {
  initial: Widget[]
  editing?: boolean
  columns?: number
  /** Published artifact body for every card — renders the sandboxed srcdoc
      iframe a real board cell carries. Omit for a never-published card. */
  html?: string
  /** Board width. Pass the viewport's own width when testing a narrow grid, or
      the cells overflow it and a gesture aimed at a cell's centre lands off
      screen. */
  boardWidth?: number
}) {
  const [widgets, setWidgets] = useState(initial)
  const { width, containerRef, mounted } = useContainerWidth({
    initialWidth: boardWidth,
  })
  // Mirror the board: viewport-keyed breakpoint, editing armed at every one.
  const lg = window.matchMedia("(min-width: 1100px)").matches
  const md = window.matchMedia("(min-width: 700px)").matches
  const breakpoint = lg ? "lg" : md ? "md" : "sm"
  const gridEditing = editing
  const narrow = breakpoint !== "lg"

  const commit = useCallback(
    (layout: readonly LayoutItem[]) => {
      setWidgets((current) =>
        current.map((w) => {
          const item = layout.find((l) => l.i === w.routine)
          if (!item) return w
          const rect = settledRect(
            item,
            columns,
            { ...w.position, ...w.size },
            narrow,
          )
          return {
            ...w,
            position: { col: rect.col, row: rect.row },
            size: { cols: rect.cols, rows: rect.rows },
          }
        }),
      )
    },
    [columns, narrow],
  )

  return (
    <>
      {/* The palette root.tsx serves inline (ADR-0009). Without it the
          `--palette-*` vars are undefined, every `var(--color-*)` in app.css
          is invalid at computed-value time, and the chrome the board paints
          can't be read back at all. */}
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: THEME_STYLESHEET }} />
      <div data-testid="state">{JSON.stringify(widgets)}</div>
      <div ref={containerRef} style={{ width: boardWidth }}>
        {mounted && (
          <ResponsiveGridLayout
            className={gridEditing ? "dash-grid is-editing" : "dash-grid"}
            width={width}
            breakpoint={breakpoint}
            breakpoints={{ lg: 1100, md: 700, sm: 0 }}
            cols={{ lg: columns, md: 2, sm: 1 }}
            layouts={{ lg: widgetsToLayout(widgets, columns) }}
            rowHeight={150}
            margin={[12, 12]}
            containerPadding={[0, 0]}
            compactor={COMPACTOR}
            dragConfig={{
              enabled: gridEditing,
              handle: ".widget-drag-handle",
              cancel: "button, a, [data-no-drag]",
              threshold: 4,
            }}
            resizeConfig={{
              enabled: gridEditing,
              handles: [...RESIZE_HANDLES],
            }}
            onDragStop={(layout) => commit(layout)}
            onResizeStop={(layout) => commit(layout)}
          >
            {widgets.map((widget) => (
              // `data-cell` is the pointer commands' anchor: they resolve a
              // Playwright locator, so they need a selector, not a node.
              <div
                key={widget.routine}
                className="widget-cell"
                data-cell={widget.routine}
              >
                <WidgetCard
                  widget={widget}
                  routine={routine(widget.routine)}
                  artifact={
                    html
                      ? { html, sha: "sha", lastRunAt: "2026-01-01T00:00:00Z" }
                      : undefined
                  }
                  now={Date.now()}
                  editing={editing}
                  onRemove={() => undefined}
                />
              </div>
            ))}
          </ResponsiveGridLayout>
        )}
      </div>
    </>
  )
}

function routine(slug: string): Routine {
  return {
    slug,
    name: slug,
    template: slug,
    schedule: "0 * * * *",
    enabled: true,
  }
}

const widget = (
  routine: string,
  col: number,
  row: number,
  cols: number,
  rows: number,
): Widget => ({ routine, position: { col, row }, size: { cols, rows } })

/** The RGL-positioned cell for a slug: its title bar names the routine. */
function cell(slug: string): HTMLElement {
  const found = [
    ...document.querySelectorAll<HTMLElement>(".react-grid-item"),
  ].find((el) => el.textContent?.includes(slug))
  if (!found) throw new Error(`no grid cell for ${slug}`)
  return found
}

function stateWidgets(): Widget[] {
  const el = document.querySelector('[data-testid="state"]')
  return JSON.parse(el?.textContent ?? "[]")
}

function placementOf(slug: string): Widget["position"] & Widget["size"] {
  const w = stateWidgets().find((w) => w.routine === slug)
  if (!w) throw new Error(`no widget ${slug}`)
  return { ...w.position, ...w.size }
}

async function mounted(ui: React.ReactElement, cells: number) {
  await render(ui)
  await expect
    .poll(() => document.querySelectorAll(".react-grid-item").length)
    .toBe(cells)
}

const handle = (slug: string) => {
  const el = cell(slug).querySelector(".widget-drag-handle")
  if (!el) throw new Error(`no drag handle on ${slug}`)
  return el
}

/** RGL's own corner grip — the one that moves both dimensions at once. */
const grip = (slug: string) => {
  const el = cell(slug).querySelector(".react-resizable-handle-se")
  if (!el) throw new Error(`no resize grip on ${slug}`)
  return el
}

/** The bottom-edge grip, which moves the height alone. */
const bottomGrip = (slug: string) => {
  const el = cell(slug).querySelector(".react-resizable-handle-s")
  if (!el) throw new Error(`no bottom grip on ${slug}`)
  return el
}

/** The well RGL paints where the lifted cell will land. Only exists while a
    gesture is open, so hold one (`mouseDrag(…, hold)`) before reaching for it. */
function dropWell(): HTMLElement {
  const el = document.querySelector<HTMLElement>(".react-grid-placeholder")
  if (!el) throw new Error("no drop well — is a gesture still open?")
  return el
}

// Selector forms of the two grab targets, for the pointer commands — they run
// in node against a Playwright locator, so they take a selector, not a node.
const GRIP = (slug: string) =>
  `[data-cell="${slug}"] .react-resizable-handle-se`
const HANDLE = (slug: string) => `[data-cell="${slug}"] .widget-drag-handle`

/** Wait for the card's veil to lift, so the artifact iframe — not the skeleton
    the parent document paints over it — is what the pointer actually meets. */
async function unveiled(slug: string) {
  await expect
    .poll(() => {
      const frame = cell(slug).querySelector("iframe")
      return frame != null && !frame.classList.contains("opacity-0")
    })
    .toBe(true)
}

function grid(): HTMLElement {
  const el = document.querySelector<HTMLElement>(".dash-grid")
  if (!el) throw new Error("no grid")
  return el
}

describe("grid editing (react-grid-layout, ADR-0041)", () => {
  it("positions each widget side by side on the desktop grid", async () => {
    await mounted(
      <GridHarness
        initial={[widget("a", 1, 1, 2, 1), widget("b", 3, 1, 2, 1)]}
      />,
      2,
    )
    // Two 2-col widgets fill a 4-col row: same top, b to the right of a.
    const a = cell("a").getBoundingClientRect()
    const b = cell("b").getBoundingClientRect()
    expect(Math.abs(a.top - b.top)).toBeLessThan(2)
    expect(b.left).toBeGreaterThan(a.right - 2)
  })

  it("arms the drag handle and resize grip in edit mode", async () => {
    await mounted(<GridHarness initial={[widget("a", 1, 1, 2, 1)]} />, 1)
    // The title bar is the drag handle, and the grid is flagged editing so the
    // resize grip is lit (RGL renders the grip span always; .is-editing shows
    // it — see app.css).
    expect(cell("a").querySelector(".widget-drag-handle")).not.toBeNull()
    expect(document.querySelector(".dash-grid.is-editing")).not.toBeNull()
    expect(cell("a").querySelector(".react-resizable-handle")).not.toBeNull()
  })

  it("disarms drag and resize outside edit mode", async () => {
    await mounted(
      <GridHarness initial={[widget("a", 1, 1, 2, 1)]} editing={false} />,
      1,
    )
    // No drag handle on the view-mode header, and the grid is not editing so
    // the resize grip stays hidden (opacity 0).
    expect(cell("a").querySelector(".widget-drag-handle")).toBeNull()
    expect(document.querySelector(".dash-grid.is-editing")).toBeNull()
  })

  it("dragging the title bar moves the widget and commits the new column", async () => {
    await mounted(<GridHarness initial={[widget("a", 1, 1, 2, 1)]} />, 1)
    // Drop a's title bar near the right edge of the 4-column grid.
    await userEvent.dragAndDrop(handle("a"), grid(), {
      targetPosition: { x: CONTAINER_WIDTH - 60, y: 20 },
    })
    await expect.poll(() => placementOf("a").col).toBeGreaterThan(1)
    // A move leaves the size alone.
    expect(placementOf("a").cols).toBe(2)
  })

  it("drops onto a neighbor by pushing it aside", async () => {
    await mounted(
      <GridHarness
        initial={[widget("a", 1, 1, 2, 1), widget("b", 3, 1, 2, 1)]}
      />,
      2,
    )
    // Drag a onto b's cell: vertical compaction slides b aside, unlike the old
    // model where dropping onto an occupied cell was rejected and a snapped
    // home. Both stay placed, and they don't overlap.
    await userEvent.dragAndDrop(handle("a"), handle("b"))
    await expect.poll(() => placementOf("a").col).toBeGreaterThan(1)
    const a = placementOf("a")
    const b = placementOf("b")
    const overlap =
      a.col < b.col + b.cols &&
      b.col < a.col + a.cols &&
      a.row < b.row + b.rows &&
      b.row < a.row + a.rows
    expect(overlap).toBe(false)
  })

  it("a widget pushed down by a drag floats back up when the space frees", async () => {
    // Regression (the reported bug): with no compaction, dragging x up onto y
    // shoved y down and it never recovered — each drag pushed it further. With
    // vertical compaction, y is displaced, then returns to the top once x moves
    // back down. Two stacked widgets: y on top (row 1), x below (row 2).
    await mounted(
      <GridHarness
        initial={[widget("top", 1, 1, 2, 1), widget("bot", 1, 2, 2, 1)]}
      />,
      2,
    )
    expect(placementOf("top").row).toBe(1)

    // Drag bot up into the top row → top is displaced downward. (Fixed grid
    // coordinates, since the target widget shifts mid-drag.)
    await userEvent.dragAndDrop(handle("bot"), grid(), {
      targetPosition: { x: 100, y: 20 },
    })
    await expect.poll(() => placementOf("bot").row).toBe(1)
    expect(placementOf("top").row).toBeGreaterThan(1)

    // Drag bot back down → top floats back to the top (never stays stranded).
    await userEvent.dragAndDrop(handle("bot"), grid(), {
      targetPosition: { x: 100, y: 340 },
    })
    await expect.poll(() => placementOf("top").row).toBe(1)
    expect(placementOf("bot").row).toBeGreaterThan(1)
  })

  /**
   * The reported bug, at its root. A cell resizes in whole rows and columns
   * while the pointer moves continuously, so on an inward drag the grip is
   * always a fraction of a step behind the finger — and what sits under the
   * finger there is the card's own artifact, a cross-origin sandboxed iframe.
   * A cross-origin frame takes the pointer with it: every mousemove and the
   * mouseup after it go to the frame, never to the parent document RGL
   * listens on, and the gesture dies where it stands.
   *
   * Every other test on this board runs on a never-published card, which has
   * no iframe at all — which is exactly why this went unnoticed.
   */
  it("shrinks a card whose grip is dragged back across its own artifact", async () => {
    await mounted(
      <GridHarness
        initial={[widget("a", 1, 1, 4, 4)]}
        html="<p>artifact</p>"
      />,
      1,
    )
    await unveiled("a")
    // Coarse steps on purpose: 900px in 8 moves puts the pointer more than a
    // whole column inside the card at every step, so it is over the artifact
    // for the entire gesture rather than only when it wins the race against
    // the grip. Without the shield this dies on the first move.
    await commands.mouseDrag(GRIP("a"), { dx: -900, dy: -450 }, 8)
    await expect.poll(() => placementOf("a").rows).toBe(1)
    expect(placementOf("a").cols).toBe(1)
  })

  it("moves a card dragged across a neighbour's artifact", async () => {
    // The same trap on the drag path: the title bar stays under the pointer,
    // but the cards it passes over do not, and one of them is an artifact.
    await mounted(
      <GridHarness
        initial={[widget("a", 1, 1, 2, 2), widget("b", 3, 1, 2, 2)]}
        html="<p>artifact</p>"
      />,
      2,
    )
    await unveiled("b")
    await commands.mouseDrag(HANDLE("a"), { dx: 700, dy: 40 }, 8)
    await expect.poll(() => placementOf("a").col).toBeGreaterThan(1)
  })

  /**
   * The board dresses RGL's structural classes in the chrome's skin from
   * `app.css`, which puts every one of those rules in `@layer components`.
   * RGL's own `css/styles.css` is imported by the board component as a plain
   * stylesheet — unlayered — and unlayered declarations outrank *every* layer
   * no matter how specific the layered selector is. So the library's defaults
   * win and the board's grid chrome is inert: the grip stays at the library's
   * `opacity: 0` in edit mode, wearing the library's 5px near-black chevron,
   * over the library's red placeholder block.
   *
   * That is the resize complaint at its root — you cannot see what to grab.
   */
  describe("the grid chrome app.css asks for", () => {
    it("lights the resize grip in edit mode, without hovering the card", async () => {
      await mounted(<GridHarness initial={[widget("a", 1, 1, 2, 2)]} />, 1)
      expect(getComputedStyle(grip("a")).opacity).toBe("1")
    })

    it("gives the grip the board's 8px chevron, not the library's 5px one", async () => {
      await mounted(<GridHarness initial={[widget("a", 1, 1, 2, 2)]} />, 1)
      const chevron = getComputedStyle(grip("a"), "::after")
      expect(chevron.width).toBe("8px")
      expect(chevron.height).toBe("8px")
    })

    it("lays the edge grips along the border, not over the artifact", async () => {
      await mounted(<GridHarness initial={[widget("a", 1, 1, 2, 2)]} />, 1)
      const bar = getComputedStyle(bottomGrip("a"), "::after")
      // A 2px bar lying on the border it moves — not the library's corner
      // caret rotated to point down, which lands the glyph inside the cell.
      expect(bar.height).toBe("2px")
      expect(bar.bottom).toBe("1px")
    })

    it("paints the drop well as a dashed outline, behind the cells", async () => {
      await mounted(
        <GridHarness
          initial={[widget("a", 1, 1, 2, 2), widget("b", 3, 1, 2, 2)]}
        />,
        2,
      )
      // RGL mounts the well only while a gesture is open, so hold one.
      await commands.mouseDrag(HANDLE("a"), { dx: 40, dy: 260 }, 12, true)
      try {
        const style = getComputedStyle(dropWell())
        expect(style.borderStyle).toBe("dashed")
        // The alpha rides in the background colour, never on the element:
        // element opacity takes the outline down with it and the dashes vanish.
        expect(style.opacity).toBe("1")
        expect(style.backgroundColor).not.toBe("rgb(255, 0, 0)")
      } finally {
        await commands.mouseRelease()
      }
    })

    it("keeps the drop well under the cells standing on it", async () => {
      await mounted(
        <GridHarness
          initial={[widget("a", 1, 1, 2, 2), widget("b", 3, 1, 2, 2)]}
        />,
        2,
      )
      await commands.mouseDrag(HANDLE("a"), { dx: 40, dy: 260 }, 12, true)
      try {
        // A well is a hole in the board. The library ranks it above every
        // settled cell instead, so it paints over whatever it overlaps — and a
        // resize growing past a neighbour washes that neighbour in accent.
        expect(Number(getComputedStyle(dropWell()).zIndex)).toBeLessThan(
          Number(getComputedStyle(cell("b")).zIndex),
        )
      } finally {
        await commands.mouseRelease()
      }
    })

    it("selects no text under a resize in progress", async () => {
      await mounted(
        <GridHarness
          initial={[widget("a", 1, 1, 2, 2), widget("b", 3, 1, 2, 2)]}
        />,
        2,
      )
      // A press-and-sweep is also how you select text. react-draggable lays
      // down a user-select hack for its own drag path; the resize grips come
      // from react-resizable, which RGL gives no way to ask — so this is
      // guarded in CSS or not at all. Read it mid-gesture: the release
      // collapses the selection, so afterwards everything looks fine.
      await commands.mouseDrag(GRIP("a"), { dx: 260, dy: 120 }, 12, true)
      const selected = String(getSelection() ?? "")
      await commands.mouseRelease()
      expect(selected).toBe("")
    })
  })

  /**
   * "Sizing the bottom edge down" is the reported gesture, and the board never
   * offered it: `resizeConfig.handles` is `["se"]`, so the only grip is the
   * corner, and the corner moves width and height at once. Making a widget
   * shorter without also making it narrower means dragging a 20px corner box
   * along a perfectly vertical line.
   */
  describe("resizing one edge at a time", () => {
    it("offers a bottom grip", async () => {
      await mounted(<GridHarness initial={[widget("a", 1, 1, 2, 2)]} />, 1)
      expect(
        cell("a").querySelector(".react-resizable-handle-s"),
      ).not.toBeNull()
    })

    it("changes only the height when the bottom grip is pulled up", async () => {
      await mounted(<GridHarness initial={[widget("a", 1, 1, 2, 3)]} />, 1)
      await commands.mouseDrag(`[data-cell="a"] .react-resizable-handle-s`, {
        dx: 0,
        dy: -320,
      })
      await expect.poll(() => placementOf("a").rows).toBe(1)
      expect(placementOf("a").cols).toBe(2)
    })
  })

  /**
   * Touch (ADR-0056, which armed the grid at every breakpoint). The library
   * was never the blocker: react-draggable binds `touchstart`/`touchmove`/
   * `touchend` and both gestures drive RGL correctly under a real touch
   * sequence. What stopped a phone was ours — the grip never opted out of the
   * browser's scroll gestures the way the title bar does, and `gridEditing`
   * was gated on `breakpoint === "lg"`.
   *
   * The gate did guard something real, which the last test here pins: RGL
   * generates the phone layout from the desktop one, so it hands back column 1
   * for every widget, and committing that verbatim would flatten the board.
   */
  describe("touch", () => {
    it("keeps the resize grip out of the browser's scroll gestures", async () => {
      await mounted(<GridHarness initial={[widget("a", 1, 1, 2, 2)]} />, 1)
      // The title bar already does this; without it on the grip, a finger on
      // the corner of a scrollable board scrolls the page instead of resizing.
      expect(getComputedStyle(grip("a")).touchAction).toBe("none")
    })

    it("reorders the stack from a finger on a phone-width viewport", async () => {
      await page.viewport(PHONE, 900)
      try {
        await mounted(
          <GridHarness
            initial={[widget("top", 1, 1, 2, 1), widget("bot", 1, 2, 2, 1)]}
            boardWidth={PHONE}
          />,
          2,
        )
        // One column on a phone, so the only meaningful move is reordering:
        // drag the lower card above the upper one and they swap.
        await commands.touchDrag(HANDLE("bot"), { dx: 0, dy: -200 })
        await expect.poll(() => placementOf("bot").row).toBe(1)
        expect(placementOf("top").row).toBeGreaterThan(1)
      } finally {
        await page.viewport(1280, 900)
      }
    })

    it("leaves the board's columns alone when reordered on a phone", async () => {
      await page.viewport(PHONE, 900)
      try {
        // Two widgets in different columns of the 4-column desktop board. A
        // phone stacks them in one column, so the layout RGL hands back can
        // only ever say col 1 / 1 column wide — committing that verbatim would
        // rewrite a desktop arrangement the phone was never shown.
        await mounted(
          <GridHarness
            initial={[widget("a", 1, 1, 2, 1), widget("b", 3, 2, 2, 1)]}
            boardWidth={PHONE}
          />,
          2,
        )
        await commands.touchDrag(HANDLE("b"), { dx: 0, dy: -200 })
        // The reorder lands...
        await expect.poll(() => placementOf("b").row).toBe(1)
        expect(placementOf("a").row).toBeGreaterThan(1)
        // ...and takes nothing horizontal with it.
        expect(placementOf("a")).toMatchObject({ col: 1, cols: 2 })
        expect(placementOf("b")).toMatchObject({ col: 3, cols: 2 })
      } finally {
        await page.viewport(1280, 900)
      }
    })
  })

  it("collapses to one full-width column on a phone-width viewport", async () => {
    await page.viewport(600, 900)
    try {
      await mounted(
        <GridHarness
          initial={[widget("a", 1, 1, 2, 1), widget("b", 3, 1, 2, 1)]}
        />,
        2,
      )
      // sm breakpoint → 1 column: every cell spans the full container width
      // (each widget is full-width), rather than a 2-of-4 half on the desktop
      // grid. Robust to stacking order, which is RGL's to decide.
      expect(cell("a").getBoundingClientRect().width).toBeGreaterThan(
        CONTAINER_WIDTH - 2,
      )
      expect(cell("b").getBoundingClientRect().width).toBeGreaterThan(
        CONTAINER_WIDTH - 2,
      )
    } finally {
      await page.viewport(1280, 900)
    }
  })
})
