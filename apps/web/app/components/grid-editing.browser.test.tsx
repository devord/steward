import { useCallback, useState } from "react"

import type { Routine, Widget } from "@steward/schema"
import {
  getCompactor,
  type LayoutItem,
  ResponsiveGridLayout,
  useContainerWidth,
} from "react-grid-layout"
import "react-grid-layout/css/styles.css"
import { describe, expect, it } from "vitest"
import { page, userEvent } from "vitest/browser"
import { render } from "vitest-browser-react"

import "../app.css"
import { layoutItemToRect, widgetsToLayout } from "../lib/rgl-layout.ts"
import { WidgetCard } from "./widget-card.tsx"

// The board's grid wired exactly as dashboard-board.tsx does it (ADR-0041):
// react-grid-layout with a free-form push compactor, controlled by a widgets
// array the commit path folds RGL's settled layout back into.
const FREEFORM = getCompactor(null, false, false)

function GridHarness({
  initial,
  editing = true,
  columns = 4,
}: {
  initial: Widget[]
  editing?: boolean
  columns?: number
}) {
  const [widgets, setWidgets] = useState(initial)
  const { width, containerRef, mounted } = useContainerWidth({
    initialWidth: 1200,
  })
  // Mirror the board: viewport-keyed breakpoint, editing on the desktop grid.
  const lg = window.matchMedia("(min-width: 1100px)").matches
  const md = window.matchMedia("(min-width: 700px)").matches
  const breakpoint = lg ? "lg" : md ? "md" : "sm"
  const gridEditing = editing && breakpoint === "lg"

  const commit = useCallback(
    (layout: readonly LayoutItem[]) => {
      setWidgets((current) =>
        current.map((w) => {
          const item = layout.find((l) => l.i === w.routine)
          if (!item) return w
          const rect = layoutItemToRect(item, columns)
          return {
            ...w,
            position: { col: rect.col, row: rect.row },
            size: { cols: rect.cols, rows: rect.rows },
          }
        }),
      )
    },
    [columns],
  )

  return (
    <>
      <div data-testid="state">{JSON.stringify(widgets)}</div>
      <div ref={containerRef} style={{ width: 1200 }}>
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
            compactor={FREEFORM}
            dragConfig={{
              enabled: gridEditing,
              handle: ".widget-drag-handle",
              cancel: "button, a, [data-no-drag]",
              threshold: 4,
            }}
            resizeConfig={{ enabled: gridEditing, handles: ["se"] }}
            onDragStop={(layout) => commit(layout)}
            onResizeStop={(layout) => commit(layout)}
          >
            {widgets.map((widget) => (
              <div key={widget.routine} className="widget-cell">
                <WidgetCard
                  widget={widget}
                  routine={routine(widget.routine)}
                  artifact={undefined}
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

function grid(): HTMLElement {
  const el = document.querySelector<HTMLElement>(".dash-grid")
  if (!el) throw new Error("no grid")
  return el
}

// The harness pins the grid container to this width, so cell widths are
// deterministic across breakpoints.
const CONTAINER_WIDTH = 1200

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

  it("drops onto a neighbor by pushing it aside (free-form + push)", async () => {
    await mounted(
      <GridHarness
        initial={[widget("a", 1, 1, 2, 1), widget("b", 3, 1, 2, 1)]}
      />,
      2,
    )
    // Drag a onto b's cell: the push compactor slides b aside, unlike the old
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
