import { assembleVegaLite } from "flint-chart/vegalite"
import { compile as compileVegaLite } from "vega-lite"
import * as vega from "vega"

import { conformChart } from "./conform.ts"
import { finish } from "./finish.ts"
import type { JsonValue } from "../json.ts"
import { useMonoMetrics } from "./measure.ts"

/**
 * Compile a routine's chart specification to inline SVG (ADR-0062).
 *
 * flint derives the form, the kit applies the finish, Vega renders it
 * headlessly. Nothing here reaches the published artifact except the SVG: no
 * runtime, no stylesheet fetch, no external reference. ADR-0002 and the
 * raw-readability floor are untouched.
 */

/**
 * Flint's own input type, derived from the function rather than restated.
 *
 * A hand-written copy would drift the first time flint widens an encoding —
 * and flint is on a monthly release cadence.
 */
type FlintInput = Parameters<typeof assembleVegaLite>[0]

/** What a routine emits — flint's own input, unchanged. */
export interface ChartSpec {
  data: FlintInput["data"]
  /** Column name → flint semantic type ("Quantity", "Date", "Category"…). */
  semantic_types: FlintInput["semantic_types"]
  /** Any of flint's catalogue. Unrestricted by design — see conform.ts. */
  chart_spec: FlintInput["chart_spec"]
  /**
   * Rows past which the form stops being readable. The one risk that cannot
   * be normalised away: forty categories in a fixed box is unreadable at any
   * configuration, and it is only discoverable at run time (ADR-0062).
   *
   * Defaults to 40 — past that no chart in the catalogue reads at these sizes.
   */
  maxRows?: number
}

/**
 * One render per width tier, and never one render scaled.
 *
 * Uniform scaling is the failure this exists to avoid: a chart scaled to fit a
 * narrower frame scales its text with it, and the type lands under
 * widget-standard §6's 12px floor. Shipping two tiers was not enough — a
 * page-only band still renders on a **raw page at any width**, so a 464px
 * render met a 300px content column at 340px and scaled to 8.8px type. Three
 * tiers, cut at the kit's own breakpoints (`tiers.css`).
 *
 * `box` is the plot rectangle handed to Vega; `budget` is the widest the
 * *emitted* SVG may be, which is the plot plus however much axis and legend
 * chrome the data turned out to need. `main` is padded `p-5` on a page, so the
 * budget is the viewport at that breakpoint less 40px.
 *
 * **The box sits just under its budget, not well under it.** These were each
 * `budget - 80`, a chrome allowance three times what real charts use: the live
 * burn-up emits 28px of chrome, so every tier gave back ~52px of a budget it
 * was entitled to and no correction ever claimed it — `fitToBudget` only ever
 * shrinks. On a phone that is a 248px plot in a 359px column, and the widget
 * reads as broken at the tile size most people see it at. A tighter allowance
 * puts the burden on the fit loop, which is what the loop is for: a chart with
 * a real legend overflows on the first pass and gets corrected, and one
 * without it fills its frame.
 */
const TIER_FIT = {
  /**
   * `tier-page` is `min-width: 900px` and open-ended, so sizing its render for
   * 900px sized it for the *narrowest* viewport that triggers it, and every
   * frame above that kept the same 860px SVG with the rest left blank.
   *
   * The widest frame an artifact ever gets is the lightbox, capped at 1500px
   * (`widget-lightbox.tsx`), less `main`'s `p-5` — so 1460px of content, filled
   * to 59%. That cap is why two bands are enough: `page` covers 900–1199 and
   * this covers 1200 up, and the worst fill across the whole range goes from
   * 59% to 79% without a third render in every artifact.
   */
  wide: { box: { width: 1130, height: 340 }, budget: 1160 },
  page: { box: { width: 830, height: 300 }, budget: 860 },
  detail: { box: { width: 630, height: 260 }, budget: 660 },
  narrow: { box: { width: 270, height: 200 }, budget: 300 },
} as const

/**
 * The tiers, listed rather than derived from `Object.keys`, which is typed
 * `string[]` and would need an assertion the repo forbids outside tests.
 */
const TIERS = ["wide", "page", "detail", "narrow"] as const

export type ChartTier = (typeof TIERS)[number]

/** What a tier's render may not exceed. Read by `conformChart`. */
export const TIER_BUDGET = {
  wide: TIER_FIT.wide.budget,
  page: TIER_FIT.page.budget,
  detail: TIER_FIT.detail.budget,
  narrow: TIER_FIT.narrow.budget,
} satisfies Record<ChartTier, number>

/** The width Vega actually emitted, which is the plot plus its chrome. */
function emittedWidth(svg: string): number {
  return Number(/<svg[^>]*\bwidth="(\d+(?:\.\d+)?)"/.exec(svg)?.[1] ?? 0)
}

/** One chart, rendered once per tier. */
export type CompiledChart = Record<ChartTier, string>

export interface ChartFailure {
  id: string
  problems: string[]
}

export interface CompiledCharts {
  charts: Map<string, CompiledChart>
  /** Bands that may not ship, and why. The caller degrades; see render.tsx. */
  failures: ChartFailure[]
}

/**
 * A kit-owned form's chance to restructure what flint assembled.
 *
 * Flint produces a single-view spec. A burn-up needs three layers — the lines,
 * a now-marker rule, the hero's end dot — and flint has no vocabulary for
 * annotation; its docs send you to post-compile editing, warning that the
 * result is "no longer a portable Flint spec". Portable there means swappable
 * to ECharts or Excel, which we never do, so the warning costs us nothing and
 * this hook is the whole reason a flint chart can look designed rather than
 * merely correct.
 *
 * Runs after `assembleVegaLite` and before `finish`, so the kit's palette and
 * type floor still land on whatever a form built.
 */
export type Decorator = (
  spec: JsonValue,
  ctx: { width: number; height: number; tier: ChartTier },
) => JsonValue

export interface ChartRequest {
  id: string
  spec: ChartSpec
  decorate?: Decorator
}

async function renderOne(
  req: ChartRequest,
  box: { width: number; height: number },
  tier: ChartTier,
): Promise<string> {
  useMonoMetrics(vega)
  // `assembleVegaLite` is declared to return `any`, so the finished spec keeps
  // that type all the way into `compile` — which is what lets this boundary
  // stay free of the assertions the repo forbids outside tests.
  const assembled = assembleVegaLite({
    data: req.spec.data,
    semantic_types: req.spec.semantic_types,
    chart_spec: { ...req.spec.chart_spec, baseSize: box },
  })
  const decorated = req.decorate
    ? req.decorate(assembled, { ...box, tier })
    : assembled
  const compiled = compileVegaLite(finish(decorated, box)).spec
  return await new vega.View(vega.parse(compiled), { renderer: "none" }).toSVG()
}

/**
 * Render a tier, shrinking the plot until the whole SVG fits the tier's
 * budget.
 *
 * The plot rectangle is what Vega is told; the emitted width is that plus
 * however much axis and legend chrome the *data* turned out to need — long
 * category names, a four-entry legend, a five-digit tick. So the box alone
 * cannot be picked to fit, and a chart whose labels ran long would silently
 * overflow its column and get scaled back under the type floor by the browser.
 *
 * Three corrections at most. Each one subtracts the measured overflow, so the
 * first is usually exact and the rest are for chrome that re-flowed; past that
 * the chart is not going to fit and `conformChart` rejects it, which is the
 * honest outcome — a dropped band with a stated reason beats a chart nobody
 * can read.
 *
 * Two corrections was one too few, and only just: `Regression` came back 868px
 * against an 860px budget, converging on the attempt the loop did not take.
 * The extra render costs nothing on a chart that already fits, because the
 * loop returns on the first pass that clears.
 */
async function fitToBudget(
  req: ChartRequest,
  tier: ChartTier,
): Promise<string> {
  const { box, budget } = TIER_FIT[tier]
  let width: number = box.width
  let svg = ""
  for (let attempt = 0; attempt < 4; attempt++) {
    svg = await renderOne(req, { width, height: box.height }, tier)
    const over = emittedWidth(svg) - budget
    if (over <= 0) return svg
    // A floor, so a chart with enormous chrome stops rather than spiralling
    // into a zero-width plot that renders as an axis and nothing else.
    //
    // The cushion grows per attempt because subtracting the measured overflow
    // assumes the chrome is constant, and when it is not the correction
    // approaches the budget without reaching it: `Regression` walked 868 → 865
    // and would have kept halving. A first correction that was exact returns on
    // the next pass and never sees this; only a re-flowing one overshoots.
    const next = Math.max(80, width - over - 2 - attempt * 12)
    if (next === width) break
    width = next
  }
  return svg
}

/**
 * Compile every chart in a document.
 *
 * Separate from `renderArtifact`, which is synchronous and has ~100 call
 * sites: `View.toSVG()` is a promise, and charts are the only thing in the
 * pipeline that is. Making the whole renderer async to accommodate one block
 * kind would have churned every one of those callers to no end — and a chart
 * genuinely *is* a compilation step ahead of the markup, not markup.
 *
 * Never throws. A run that cannot draw its chart still has a ledger worth
 * publishing, and `cli.mjs` already reasons this way for a scheduled job:
 * publishing nothing is the worse outcome.
 */
export async function compileCharts(
  blocks: ChartRequest[],
): Promise<CompiledCharts> {
  const charts = new Map<string, CompiledChart>()
  const failures: ChartFailure[] = []

  for (const req of blocks) {
    const { id, spec } = req
    const rows = spec.data?.values?.length ?? 0
    const ceiling = spec.maxRows ?? 40
    if (rows > ceiling) {
      failures.push({
        id,
        problems: [
          `${rows} rows exceeds the form's ceiling of ${ceiling} — the plot would be unreadable, so the band is dropped`,
        ],
      })
      continue
    }

    try {
      const problems: string[] = []
      const draw = async (tier: ChartTier) => {
        const svg = await fitToBudget(req, tier)
        problems.push(
          ...conformChart(svg, `${id} (${tier})`, TIER_BUDGET[tier]),
        )
        return svg
      }
      // Built whole rather than filled in a loop, so the record is complete by
      // construction and needs no assertion to say so.
      const rendered = {
        wide: await draw("wide"),
        page: await draw("page"),
        detail: await draw("detail"),
        narrow: await draw("narrow"),
      } satisfies CompiledChart
      if (problems.length) failures.push({ id, problems })
      else charts.set(id, rendered)
    } catch (e) {
      failures.push({
        id,
        problems: [
          `${spec.chart_spec?.chartType ?? "chart"} did not render: ${
            e instanceof Error ? e.message : String(e)
          }`,
        ],
      })
    }
  }

  return { charts, failures }
}
