/**
 * The `throughput` band's behaviour, injected by the board (ADR-0050).
 *
 * The static render already shows the latest day — this adds the toggles and
 * the scrub on top of a chart that is there either way. Same contract as the
 * copy action: the markup ships inert with `data-*` seams, the board attaches,
 * and a raw-opened file simply stays on the day it was published.
 *
 * Built to `kit/throughput.js` by `build.mjs` and imported `?raw` by the board,
 * exactly as `kit.css` is. Written as a module rather than a template literal
 * for one reason: at this size, a string is a blob nothing can test, and a
 * frozen untestable blob is the thing this band was migrated to escape.
 *
 * It never rebuilds a column from scratch. The server's markup is the only
 * definition of what a column looks like, so switching views *clones* the
 * column the server drew and patches the face — the alternative is a second
 * copy of `Avatar` living here, drifting from the first.
 */
import {
  axisMax,
  decodeView,
  type DecodedView,
  type EncodedView,
  frameAt,
  type Mode,
} from "../components/throughput-series.ts"

interface Person {
  name?: string
  avatar?: string
  url?: string
}

interface Payload {
  views: { key: string; series: EncodedView }[]
  people: Record<string, Person>
  legend: { merged: string; open: string }
}

const q = <T extends Element>(root: ParentNode, sel: string) =>
  root.querySelector<T>(sel)
const qa = <T extends Element>(root: ParentNode, sel: string) =>
  Array.from(root.querySelectorAll<T>(sel))

/**
 * Below this a value label is a digit run, not a number. Measured, not guessed.
 *
 * 26 rather than 22 since the labels came off 10px and onto the 12px artifact
 * floor: three digits of Geist Mono at 12px measure 21.6px, so the old floor
 * now sits *under* the widest label it is meant to admit.
 */
const LEGIBLE_COLUMN_PX = 26

/**
 * `cloneNode` is typed to `Node`, and the answer is not a cast. This runs
 * inside the frame, so `HTMLElement` is that document's own constructor and
 * the check is real rather than a formality.
 */
function cloneElement(el: HTMLElement): HTMLElement | null {
  const copy = el.cloneNode(true)
  return copy instanceof HTMLElement ? copy : null
}

function install(root: HTMLElement): void {
  const raw = q(root, "[data-kit-throughput-series]")?.textContent
  if (!raw) return
  let payload: Payload
  try {
    payload = JSON.parse(raw)
  } catch {
    // A malformed payload leaves the static render exactly as published —
    // which is a real chart of a real day, not a broken one.
    return
  }

  const found = q<HTMLElement>(root, "[data-kit-throughput-plot]")
  if (!found || !payload.views?.length) return
  // Re-bound after the guard so the closures below see a plot that cannot be
  // null. They are hoisted declarations, so the narrowing does not reach them.
  const plot: HTMLElement = found

  const decoded = new Map<string, DecodedView>()
  const viewOf = (key: string): DecodedView => {
    let v = decoded.get(key)
    if (!v) {
      const found = payload.views.find((x) => x.key === key) ?? payload.views[0]
      v = decodeView(found.series)
      decoded.set(key, v)
    }
    return v
  }

  // Start from what the server said, not from a re-derivation of it. Guessing
  // here is how the first attached frame ends up differing from the one on
  // screen, which reads as the chart flinching when a frame loads.
  let viewKey = root.dataset.kitThroughputView ?? payload.views[0].key
  let mode: Mode =
    root.dataset.kitThroughputMode === "window" ? "window" : "cumulative"
  let windowDays = Number(root.dataset.kitThroughputWindow) || 7
  let view = viewOf(viewKey)
  let index = Math.max(0, view.days.length - 1)
  let ceiling = axisMax(view.days, view.authors, mode, windowDays)

  // The server's own column, kept before anything mutates it, as the only
  // definition of a column's markup.
  //
  // Prefer one with a face on it. `Avatar` emits the <img> only when there is
  // an avatar to put in it, so cloning a faceless column would leave nothing
  // to patch a face into — every rebuilt column would be an initial, decided
  // by whoever happened to rank first.
  const all = qa<HTMLElement>(plot, "[data-kit-throughput-col]")
  const prototype = all.find((el) => el.querySelector("img")) ?? all[0]
  const cloned = prototype && cloneElement(prototype)
  if (!cloned) return
  const blank: HTMLElement = cloned

  let columns = new Map<string, HTMLElement>()
  const indexColumns = () => {
    columns = new Map(
      qa<HTMLElement>(plot, "[data-kit-throughput-col]").map((el) => [
        el.dataset.kitThroughputCol ?? "",
        el,
      ]),
    )
  }
  indexColumns()

  // The faces the server already drew, read back before anything rebuilds the
  // plot. An inlined avatar is a few KB of data URI, and the payload used to
  // ship a second copy of every one of them — a third of the published bytes
  // on the artifact this band exists for. So the renderer sends only the faces
  // it did not draw (everyone the *other* views add), and these are the rest.
  const drawn = new Map<string, string>()
  for (const [key, el] of columns) {
    const src = el.querySelector("img")?.getAttribute("src")
    if (src) drawn.set(key, src)
  }

  /** Build the plot for a view whose people may differ from the last one's. */
  function buildColumns(): void {
    plot.textContent = ""
    for (const key of view.authors) {
      const col = cloneElement(blank)
      if (!col) continue
      col.dataset.kitThroughputCol = key
      const person = payload.people?.[key] ?? {}
      const name = person.name?.trim() || key

      const link = col.querySelector("a")
      if (link) link.href = person.url ?? `https://github.com/${key}`

      // The face, patched in place: initial, optional image, sr-only name.
      const glyph = col.querySelector<HTMLElement>(
        "[title]:not([data-kit-throughput-col])",
      )
      const img = col.querySelector("img")
      // Only a data URI ever reaches here — the renderer strips the rest,
      // because the sandbox cannot reach an avatar host (ADR-0044) — and the
      // harvested half came out of an <img> the renderer had already vetted.
      const avatar = person.avatar ?? drawn.get(key)
      if (avatar) {
        if (img) {
          img.src = avatar
          img.alt = ""
        }
      } else img?.remove()
      if (glyph) {
        glyph.title = name
        // First text node is the initial; the sr-only span carries the name.
        const initial = [...name][0]?.toUpperCase() ?? "?"
        for (const node of Array.from(glyph.childNodes))
          if (node.nodeType === Node.TEXT_NODE) node.textContent = initial
      }
      const srOnly = col.querySelector("span.sr-only")
      if (srOnly) srOnly.textContent = name
      plot.appendChild(col)
    }
    indexColumns()
  }

  function draw(): void {
    if (!view.days.length) return
    const frame = frameAt(view, index, mode, windowDays)
    const words = payload.legend ?? { merged: "merged", open: "open" }
    const openWord = mode === "cumulative" ? words.open : "opened"

    // FLIP: where every column sits now…
    const before = new Map<string, number>()
    for (const [key, el] of columns)
      before.set(key, el.getBoundingClientRect().left)

    // …then the update, including the re-order…
    frame.order.forEach((key, rank) => {
      const el = columns.get(key)
      if (!el) return
      const seg = frame.segments[key] ?? { merged: 0, open: 0 }
      const total = seg.merged + seg.open
      el.style.order = String(rank)
      const merged = q<HTMLElement>(el, "[data-kit-throughput-merged]")
      const open = q<HTMLElement>(el, "[data-kit-throughput-open]")
      if (merged) merged.style.height = `${(seg.merged / ceiling) * 100}%`
      if (open) open.style.height = `${(seg.open / ceiling) * 100}%`
      const value = q<HTMLElement>(el, "[data-kit-throughput-value]")
      if (value) value.textContent = total ? String(total) : ""
      const name = payload.people?.[key]?.name?.trim() || key
      el.title = `${name} — ${seg.merged} ${words.merged}, ${seg.open} ${openWord}`
    })

    // …then invert to where they were and release, so the swap glides.
    for (const [key, el] of columns) {
      const dx = (before.get(key) ?? 0) - el.getBoundingClientRect().left
      if (dx) {
        el.style.transition = "none"
        el.style.transform = `translateX(${dx}px)`
      }
    }
    requestAnimationFrame(() => {
      for (const el of columns.values()) {
        el.style.transition = ""
        el.style.transform = ""
      }
    })

    const date = q(root, "[data-kit-throughput-date]")
    if (date) date.textContent = shortDate(frame.date)
    const total = q(root, "[data-kit-throughput-total]")
    if (total)
      total.textContent =
        `${frame.totalMerged} ${words.merged} · ${frame.totalOpen} ${openWord}` +
        (mode === "cumulative" ? "" : ` · last ${windowLabel(windowDays)}`)
    const axis = q(root, "[data-kit-throughput-axis]")
    if (axis) axis.textContent = String(ceiling)
    const legendOpen = q(root, "[data-kit-throughput-legend-open]")
    if (legendOpen) legendOpen.textContent = openWord

    // Value labels collide into an unreadable digit run once columns get
    // narrow — which is the normal case, not the corner case: 30 people in a
    // one-column tile. Measured rather than guessed at from a breakpoint.
    const probe = columns.get(frame.order[0] ?? "")
    if (probe)
      plot.classList.toggle(
        "kit-throughput-nolabels",
        probe.getBoundingClientRect().width < LEGIBLE_COLUMN_PX,
      )
  }

  function rescale(): void {
    ceiling = axisMax(view.days, view.authors, mode, windowDays)
  }

  // ---- controls ----------------------------------------------------------
  const scrub = q<HTMLElement>(root, "[data-kit-scrub]")
  const slider = q<HTMLInputElement>(root, "[data-kit-scrub-input]")

  function loadView(key: string): void {
    viewKey = key
    view = viewOf(key)
    // max before value: a range input clamps to the current max, so a stale
    // smaller max silently resets the position the reader chose.
    if (slider) {
      slider.max = String(Math.max(0, view.days.length - 1))
      index = Math.min(index, Math.max(0, view.days.length - 1))
      slider.value = String(index)
    }
    buildColumns()
    rescale()
    draw()
  }

  for (const group of qa<HTMLElement>(root, "[data-kit-toggle]")) {
    group.hidden = false
    group.addEventListener("click", (event) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      const button = target.closest<HTMLElement>("[data-kit-toggle-option]")
      if (!button || !group.contains(button)) return
      const value = button.dataset.kitToggleOption ?? ""
      if (value === group.dataset.kitToggleValue) return

      group.dataset.kitToggleValue = value
      for (const option of qa<HTMLElement>(group, "[data-kit-toggle-option]"))
        option.setAttribute(
          "aria-pressed",
          String(option.dataset.kitToggleOption === value),
        )
      // Available to CSS as well as to script, so a purely presentational
      // toggle needs no code at all.
      document.documentElement.dataset[
        `kitToggle${capitalise(group.dataset.kitToggle ?? "")}`
      ] = value

      switch (group.dataset.kitToggle) {
        case "view":
          loadView(value)
          break
        case "mode":
          mode = value === "window" ? "window" : "cumulative"
          root.dataset.kitThroughputMode = mode
          syncWindowVisibility()
          rescale()
          draw()
          break
        case "window":
          windowDays = Number(value) || windowDays
          root.dataset.kitThroughputWindow = String(windowDays)
          rescale()
          draw()
          break
      }
    })
  }

  /** The window picker only means anything in the windowed view. */
  function syncWindowVisibility(): void {
    const picker = q<HTMLElement>(root, '[data-kit-toggle="window"]')
    if (picker) picker.hidden = mode !== "window"
  }
  syncWindowVisibility()

  if (scrub && slider) {
    scrub.hidden = false
    slider.addEventListener("input", () => {
      index = Number(slider.value)
      draw()
    })
  }

  // Column widths — and therefore label legibility — are a function of the
  // frame, so a resize has to re-measure. Coalesced to one frame: a drag
  // otherwise fires this on every intermediate width.
  let pending = 0
  window.addEventListener("resize", () => {
    if (pending) return
    pending = requestAnimationFrame(() => {
      pending = 0
      draw()
    })
  })

  // The first draw is the frame the server already rendered, so nothing moves.
  draw()
}

const MONTH = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-")
  const month = MONTH[Number(m) - 1]
  return month ? `${month} ${Number(d)}` : iso
}

function windowLabel(days: number): string {
  return days === 1
    ? "day"
    : days === 7
      ? "week"
      : days === 30
        ? "month"
        : `${days} days`
}

function capitalise(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

/** Attach to every throughput band in the document. Safe to call more than once. */
export function installThroughput(scope: ParentNode = document): void {
  for (const root of qa<HTMLElement>(scope, "[data-kit-throughput]")) {
    if (root.dataset.kitThroughputReady) continue
    root.dataset.kitThroughputReady = "1"
    install(root)
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", () => installThroughput())
  else installThroughput()
}
