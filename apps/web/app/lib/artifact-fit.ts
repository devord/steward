/**
 * Fit-to-height, injected by the board (ADR-0019, ADR-0050).
 *
 * Tiles never scroll, so content that does not fit has to *degrade* — fewer
 * rows plus a visible "+N more" — rather than clip mid-line. This used to be a
 * 130-line snippet each artifact transcribed for itself, and it drifted into
 * three divergent copies across four live widgets. One implementation, owned
 * here, is the entire point.
 *
 * The contract an artifact opts into:
 *
 *   [data-fit-list]     a container holding trimmable units
 *   [data-fit-item]     one unit, hidden as a whole when it will not fit
 *   [data-fit-keep]     never trim this unit
 *   [data-fit-section]  the block to collapse when its list empties out
 *   [data-fit-first]    yield before every other list, whatever the order;
 *                       reduces to its label rather than disappearing
 *
 * Two things the move let us fix. The marker is now injected as a *sibling*
 * of the list rather than a child, so it has no list or table semantics to
 * fight — the old snippet warned that as an `<li>` a subgridded row rule would
 * claim it as a row and size a column to its text. And a trimmable unit can be
 * any element, so a table row plus its detail row live in one `<tbody
 * data-fit-item>` and disappear together, which a per-`<tr>` pass could not do.
 */
/**
 * The pass as an expression evaluating to `fit()`, for embedding in the tile
 * guard so it shares that script's observer and lifecycle.
 */
export const FIT_FACTORY = `(function(){
  var d = document.documentElement
  function over() {
    return Math.max(d.scrollHeight, document.body.scrollHeight) > d.clientHeight + 1
  }
  function unitsOf(list) {
    // Only units belonging to *this* list — nested lists own their own.
    return [].slice.call(list.querySelectorAll("[data-fit-item]")).filter(
      function (el) { return el.closest("[data-fit-list]") === list }
    )
  }
  function owner(list) { return list.closest("[data-fit-section]") || list }
  function marker(list) {
    var m = list.nextElementSibling
    if (!m || !m.hasAttribute || !m.hasAttribute("data-fit-more")) {
      m = document.createElement("div")
      m.setAttribute("data-fit-more", "")
      list.parentNode.insertBefore(m, list.nextSibling)
    }
    return m
  }
  function reset(list) {
    var box = owner(list)
    box.hidden = false
    box.removeAttribute("data-fit-collapsed")
    box.removeAttribute("data-fit-label-only")
    list.hidden = false
    var m = marker(list)
    m.hidden = true
    // Every re-fit measures from the whole artifact. Without this a tile can
    // only ever shrink: grow the widget back and the rows stay hidden.
    var units = unitsOf(list).filter(function (el) {
      return !el.hasAttribute("data-fit-keep")
    })
    units.forEach(function (el) { el.hidden = false })
    return {
      list: list, more: m, units: units, hidden: 0, done: false,
      // A pinned unit is itself a reason for the section to survive. (The old
      // snippet also honoured a .now class; the pass runs only for
      // kit-rendered files, and no kit component emits one. No backticks in
      // here — this whole function is a template literal, and one would end
      // it mid-comment.)
      pinned: list.querySelectorAll("[data-fit-keep]").length,
    }
  }
  function trim(s) {
    if (s.done) return false
    var moved = false
    while (over() && s.hidden < s.units.length) {
      // The next hide would empty this list. Drop the whole section instead:
      // a heading over a bare "+7 more" names content and delivers none, and
      // spends a row saying so. A pinned unit overrides that — the section
      // stays, carrying the row that had to survive.
      if (s.hidden + 1 === s.units.length && s.pinned === 0) {
        var box = owner(s.list)
        // …except for a yield-first band, where the heading is the point. A
        // bookkeeping section reduced to its label still tells the reader
        // there are records to tidy and how many; hiding it says there are
        // none. Because it yields before everything else it reaches this
        // branch on almost every tile, so collapsing it whole would mean it
        // never appears outside the full view — narrower than the rule it
        // replaced, which kept the label and dropped only the rows.
        if (s.list.hasAttribute("data-fit-first")) {
          s.list.hidden = true
          s.more.hidden = true
          box.setAttribute("data-fit-label-only", "")
        } else {
          box.setAttribute("data-fit-collapsed", "")
          box.hidden = true
        }
        s.done = true
        return true
      }
      var before = Math.max(d.scrollHeight, document.body.scrollHeight)
      var el = s.units[s.units.length - ++s.hidden]
      el.hidden = true
      // Hiding freed no height: in a multi-column tier some other column is
      // the constraint right now. Put it back and yield — a later sweep
      // retries once that column has given way.
      if (Math.max(d.scrollHeight, document.body.scrollHeight) >= before) {
        el.hidden = false
        s.hidden--
        return moved
      }
      moved = true
      s.more.hidden = false
      s.more.textContent = "+" + s.hidden + " more"
    }
    if (s.hidden >= s.units.length) s.done = true
    return moved
  }
  return function fit() {
    if (!d.hasAttribute("data-steward-tile")) return
    // Bottom-most lists give way first — the top of the tile is the glance.
    var lists = [].slice.call(document.querySelectorAll("[data-fit-list]")).reverse()
    // …except where position and priority disagree. A bookkeeping section can
    // sit ABOVE the content it is subordinate to, and bottom-up trimming would
    // then eat the whole point of the widget before surrendering one
    // housekeeping row. [data-fit-first] says "yield before anything else",
    // which is the thing a pixel-height gate was previously approximating.
    lists.sort(function (a, b) {
      return (
        (b.hasAttribute("data-fit-first") ? 1 : 0) -
        (a.hasAttribute("data-fit-first") ? 1 : 0)
      )
    })
    if (!lists.length) return
    var state = lists.map(reset)
    // One ordered pass is not enough in a multi-column tier: a list that
    // frees no height while the other column is taller yields, and a
    // single-pass fit never returns to it. Each sweep either hides at least
    // one unit or ends the loop, and units are finite, so this terminates.
    var progress = true
    while (over() && progress) {
      progress = false
      state.forEach(function (s) { if (trim(s)) progress = true })
    }
  }
})()`

/**
 * Styling for the injected marker. It lives in the frame rather than the kit
 * because the frame is what creates the element — an artifact published
 * against an older kit still gets a legible count.
 */
export const FIT_STYLE =
  "[data-fit-more]{font:12px var(--font-mono,ui-monospace);" +
  // ink-dim, not ink-faint: "+N more" is text, and ink-faint is a glyph
  // role below AA on all but one theme (DESIGN.md).
  "color:var(--color-ink-dim,#a89984);padding-top:2px}" +
  "[data-fit-more][hidden]{display:none}"
