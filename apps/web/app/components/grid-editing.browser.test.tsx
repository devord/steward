import { useCallback, useState } from "react"

import type { Routine, Widget } from "@bulletin/schema"
import { describe, expect, it } from "vitest"
import { render } from "vitest-browser-react"

import "../app.css"
import { cssVars } from "../lib/css.ts"
import type { Rect } from "../lib/placement.ts"
import { useGridDrag } from "../lib/use-grid-drag.ts"
import { WidgetCard } from "./widget-card.tsx"

/** Real-layout harness: the dashboard grid wired exactly like home.tsx. */
function GridHarness({ initial }: { initial: Widget[] }) {
  const [widgets, setWidgets] = useState(initial)

  const placeWidget = useCallback((slug: string, rect: Rect) => {
    setWidgets((current) =>
      current.map((w) =>
        w.routine === slug
          ? {
              ...w,
              position: { col: rect.col, row: rect.row },
              size: { cols: rect.cols, rows: rect.rows },
            }
          : w,
      ),
    )
  }, [])

  const { drag, gridRef, startDrag } = useGridDrag({
    widgets,
    rowHeight: 150,
    onCommit: placeWidget,
  })

  return (
    <main
      ref={gridRef}
      className="dash-grid"
      style={cssVars({ "--row-h": "150px" })}
    >
      {widgets.map((widget) => (
        <WidgetCard
          key={widget.routine}
          widget={widget}
          routine={routine(widget.routine)}
          artifact={undefined}
          now={Date.now()}
          editing
          drag={drag?.slug === widget.routine ? drag : null}
          onDragStart={(kind, event) => startDrag(widget.routine, kind, event)}
          onResize={(size) =>
            setWidgets((current) =>
              current.map((w) =>
                w.routine === widget.routine ? { ...w, size } : w,
              ),
            )
          }
        />
      ))}
    </main>
  )
}

function routine(slug: string): Routine {
  return {
    slug,
    name: slug,
    skill: slug,
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

function card(slug: string): HTMLElement {
  const found = [
    ...document.querySelectorAll<HTMLElement>("article.widget-cell"),
  ].find((a) => a.getAttribute("aria-label")?.startsWith(slug))
  if (!found) throw new Error(`no card for ${slug}`)
  return found
}

/** React 19 commits asynchronously — wait until all cards are mounted. */
async function mounted(ui: React.ReactElement, cards: number) {
  render(ui)
  await expect
    .poll(() => document.querySelectorAll("article.widget-cell").length)
    .toBe(cards)
}

function placementOf(el: HTMLElement) {
  return {
    col: Number(el.style.getPropertyValue("--col")),
    row: Number(el.style.getPropertyValue("--row")),
    cols: Number(el.style.getPropertyValue("--cols")),
    rows: Number(el.style.getPropertyValue("--rows")),
  }
}

/** Grid geometry: one column step in px, from the rendered grid. */
function colStep(): number {
  const grid = document.querySelector(".dash-grid")
  if (!grid) throw new Error("no grid")
  return (grid.getBoundingClientRect().width - 36) / 4 + 12
}

const pointer = (x: number, y: number): PointerEventInit => ({
  bubbles: true,
  cancelable: true,
  clientX: x,
  clientY: y,
  button: 0,
  pointerId: 1,
})

function drag(from: Element, dx: number, dy: number) {
  const rect = from.getBoundingClientRect()
  const sx = rect.left + rect.width / 2
  const sy = rect.top + rect.height / 2
  from.dispatchEvent(new PointerEvent("pointerdown", pointer(sx, sy)))
  window.dispatchEvent(
    new PointerEvent("pointermove", pointer(sx + dx, sy + dy)),
  )
  window.dispatchEvent(new PointerEvent("pointerup", pointer(sx + dx, sy + dy)))
}

function part(slug: string, selector: string): Element {
  const el = card(slug).querySelector(selector)
  if (!el) throw new Error(`no ${selector} on ${slug}`)
  return el
}

const dragSurface = (slug: string) => part(slug, "div.absolute.inset-0")

const resizeHandle = (slug: string) => part(slug, "div.cursor-nwse-resize")

describe("grid drag editing", () => {
  it("drag on the card moves it to the snapped free cell", async () => {
    await mounted(<GridHarness initial={[widget("a", 1, 1, 2, 1)]} />, 1)

    drag(dragSurface("a"), colStep(), 162)

    await expect
      .poll(() => placementOf(card("a")))
      .toEqual({ col: 2, row: 2, cols: 2, rows: 1 })
  })

  it("dropping onto another widget reverts", async () => {
    await mounted(
      <GridHarness
        initial={[widget("a", 1, 1, 2, 1), widget("b", 3, 1, 2, 1)]}
      />,
      2,
    )

    drag(dragSurface("a"), colStep() * 2, 0)

    await expect
      .poll(() => placementOf(card("a")))
      .toEqual({ col: 1, row: 1, cols: 2, rows: 1 })
  })

  it("dragging the corner handle resizes by whole cells", async () => {
    await mounted(<GridHarness initial={[widget("a", 1, 1, 1, 1)]} />, 1)

    drag(resizeHandle("a"), colStep() * 2, 162)

    await expect
      .poll(() => placementOf(card("a")))
      .toEqual({ col: 1, row: 1, cols: 3, rows: 2 })
  })

  it("shift+arrow on a focused card resizes from the keyboard", async () => {
    await mounted(<GridHarness initial={[widget("a", 1, 1, 1, 1)]} />, 1)

    const el = card("a")
    el.focus()
    el.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowRight",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    )

    await expect
      .poll(() => placementOf(card("a")))
      .toEqual({ col: 1, row: 1, cols: 2, rows: 1 })
  })
})
