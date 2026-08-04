import { assembleVegaLite } from "flint-chart/vegalite"
import { compile as compileVegaLite } from "vega-lite"
import * as vega from "vega"

import { conformChart } from "./conform.ts"
import { finish } from "./finish.ts"
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
 * The two boxes a chart band renders into.
 *
 * Two renders rather than one scaled: uniform scaling puts the type below the
 * 12px floor at the narrow end and blows it up at the wide end, so a capped
 * single render fails widget-standard §6 the moment its frame is narrower than
 * its natural width. Measured at ~11 KB each against the 33.8 KB of `kit.css`
 * already inlined in every artifact, which is what makes this affordable.
 */
const BOXES = {
  page: { width: 820, height: 300 },
  tile: { width: 420, height: 220 },
} as const

/**
 * The tiers, listed rather than derived from `Object.keys`, which is typed
 * `string[]` and would need an assertion the repo forbids outside tests.
 */
const TIERS = ["page", "tile"] as const

export type ChartTier = (typeof TIERS)[number]

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

async function renderOne(
  spec: ChartSpec,
  box: { width: number; height: number },
): Promise<string> {
  useMonoMetrics(vega)
  // `assembleVegaLite` is declared to return `any`, so the finished spec keeps
  // that type all the way into `compile` — which is what lets this boundary
  // stay free of the assertions the repo forbids outside tests.
  const assembled = assembleVegaLite({
    data: spec.data,
    semantic_types: spec.semantic_types,
    chart_spec: { ...spec.chart_spec, baseSize: box },
  })
  const compiled = compileVegaLite(finish(assembled, box)).spec
  return await new vega.View(vega.parse(compiled), { renderer: "none" }).toSVG()
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
  blocks: {
    id: string
    spec: ChartSpec
  }[],
): Promise<CompiledCharts> {
  const charts = new Map<string, CompiledChart>()
  const failures: ChartFailure[] = []

  for (const { id, spec } of blocks) {
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
        const svg = await renderOne(spec, BOXES[tier])
        problems.push(...conformChart(svg, `${id} (${tier})`))
        return svg
      }
      // Built whole rather than filled in a loop, so the record is complete by
      // construction and needs no assertion to say so.
      const rendered: CompiledChart = {
        page: await draw("page"),
        tile: await draw("tile"),
      }
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
