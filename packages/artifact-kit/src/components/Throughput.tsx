import { Avatar, type Face } from "./Avatar.tsx"
import {
  axisMax,
  decodeView,
  type EncodedView,
  frameAt,
  type Mode,
} from "./throughput-series.ts"
import { Scrubber } from "./Scrubber.tsx"
import { ToggleGroup } from "./ToggleGroup.tsx"
import { escapeContextBlock } from "../Shell.tsx"

/**
 * One person's throughput over time, as a column per person you can scrub
 * through day by day.
 *
 * The band `repo-stats` moved onto the kit, and the reason the migration was
 * worth doing twice over:
 *
 * - **It renders.** The frozen template built every column in script, so an
 *   artifact opened off the artifacts branch — or read by anything that does
 *   not run JS — showed an empty plot with a scale beside it. This draws the
 *   latest day server-side, which is the day that answers the question anyway.
 *   Behaviour adds scrubbing to a chart that is already there (ADR-0039).
 * - **It is gated.** Publishing through the kit means publishing through
 *   `publish-widget`, which the routine's own publish path bypassed. That gap
 *   is how the palette sat on classic gruvbox for a week.
 *
 * Two tones, not a categorical palette: merged and open are one fact in two
 * states, so they read as one stack. A per-person hue would imply the people
 * are the axis, and the axis is time.
 *
 * Named for its subject, not its shape. This was `columns` first, which read
 * as the kit's generic bar chart and is not one: the encoded triple is
 * `[open, merged, created]`, `face()` resolves a key as a GitHub login, and
 * the windowed maths in `throughput-series.ts` turns on `open` being a level
 * that falls as PRs merge while `created` counts events. `legend` renames
 * those in the UI but not in the schema. A routine wanting columns of
 * something else needs its own band, and a shape-named one would have hidden
 * that behind a name that sounded reusable.
 */
export interface ThroughputSpec {
  /**
   * The alternative rankings the first toggle switches between — for
   * `repo-stats`, the same PRs grouped by author or by reviewer. The first is
   * what the static render draws; a single view emits no toggle at all.
   */
  views: {
    key: string
    label: string
    series: EncodedView
  }[]
  /**
   * Display metadata per person key. A person absent here renders under their
   * own key with an initial for a face — a missing registry entry costs a name,
   * not a column.
   */
  people?: Record<string, { name?: string; avatar?: string; url?: string }>
  /**
   * Offer the trailing-window view — "merged in the last week" rather than
   * "merged ever" — and the windows to offer, in days. Cumulative only when
   * absent.
   */
  windows?: number[]
  /** What one unit is, for the totals line. Defaults to "merged" / "open". */
  legend?: { merged: string; open: string }
}

const WINDOW_LABEL: Record<number, string> = {
  1: "1 day",
  7: "1 week",
  30: "1 month",
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

/** `2026-03-04` → `Mar 4`. The axis is dense; a full date on every tick is not. */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split("-")
  const month = MONTH[Number(m) - 1]
  return month ? `${month} ${Number(d)}` : iso
}

function face(key: string, meta: ThroughputSpec["people"]): Face {
  const p = meta?.[key]
  return {
    name: p?.name?.trim() || key,
    // Avatar drops anything that is not a data URI — the sandbox cannot reach
    // an avatar host, and a scheduled run is exactly where that bites.
    src: p?.avatar,
    href: p?.url ?? `https://github.com/${key}`,
  }
}

/**
 * The people registry as the runtime gets it, with unreachable avatars gone.
 *
 * `Avatar` already refuses a non-`data:` src, but the runtime rebuilds every
 * column on a toggle and would otherwise be free to put the dropped URL back —
 * two places enforcing one rule, and the second one is the one nobody tests
 * because it only runs on the board. Dropping it here means the runtime never
 * sees a src it must not use, and the payload stops carrying dead URLs.
 */
function payloadPeople(
  people: ThroughputSpec["people"],
): NonNullable<ThroughputSpec["people"]> {
  const out: NonNullable<ThroughputSpec["people"]> = {}
  for (const [key, p] of Object.entries(people ?? {}))
    out[key] = {
      ...p,
      avatar: p.avatar?.startsWith("data:") ? p.avatar : undefined,
    }
  return out
}

export function Throughput({ spec }: { spec: ThroughputSpec }) {
  const views = spec.views ?? []
  const active = views[0]
  const decoded = active ? decodeView(active.series) : { authors: [], days: [] }
  const mode: Mode = "cumulative"
  const windows = spec.windows ?? []
  const windowDays = windows[0] ?? 7
  const last = Math.max(0, decoded.days.length - 1)
  const ceiling = axisMax(decoded.days, decoded.authors, mode, windowDays)
  const frame = frameAt(decoded, last, mode, windowDays)
  const words = spec.legend ?? { merged: "merged", open: "open" }

  return (
    <div
      className="flex flex-col gap-2"
      data-kit-throughput=""
      // The runtime reads its whole starting position off the markup rather
      // than re-deriving it, so the first frame it draws is the one already on
      // screen and nothing jumps when the board attaches.
      data-kit-throughput-mode={mode}
      data-kit-throughput-window={windowDays}
      data-kit-throughput-view={active?.key}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span
          className="text-ink font-mono text-sm leading-none"
          data-kit-throughput-date=""
        >
          {frame.date ? shortDate(frame.date) : ""}
        </span>
        <span
          className="text-ink-dim font-mono text-xs leading-none"
          data-kit-throughput-total=""
        >
          {frame.totalMerged} {words.merged} · {frame.totalOpen} {words.open}
        </span>
      </div>

      {views.length > 1 || windows.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {views.length > 1 ? (
            <ToggleGroup
              spec={{
                key: "view",
                label: "Group by",
                value: active?.key,
                options: views.map((v) => ({ value: v.key, label: v.label })),
              }}
            />
          ) : null}
          {windows.length > 0 ? (
            <>
              <ToggleGroup
                spec={{
                  key: "mode",
                  label: "Totals",
                  value: mode,
                  options: [
                    { value: "cumulative", label: "all time" },
                    { value: "window", label: "recent" },
                  ],
                }}
              />
              <ToggleGroup
                spec={{
                  key: "window",
                  label: "Window",
                  value: String(windowDays),
                  options: windows.map((d) => ({
                    value: String(d),
                    label: WINDOW_LABEL[d] ?? `${d} days`,
                  })),
                }}
              />
            </>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-stretch gap-1.5">
        <div className="text-ink-faint flex w-6 shrink-0 flex-col justify-between py-0.5 text-right font-mono text-[10px] leading-none">
          <span data-kit-throughput-axis="">{ceiling}</span>
          <span>0</span>
        </div>
        {/* Always scrollable rather than conditionally: 30+ people in a
            one-column tile is the normal case, not the overflow case. */}
        <div
          className="flex h-28 min-w-0 flex-1 items-end gap-0.5 overflow-x-auto"
          data-kit-throughput-plot=""
        >
          {frame.order.map((key) => {
            const seg = frame.segments[key] ?? { merged: 0, open: 0 }
            const total = seg.merged + seg.open
            return (
              <div
                key={key}
                className="flex h-full min-w-[14px] flex-1 flex-col items-center justify-end gap-1"
                data-kit-throughput-col={key}
                title={`${face(key, spec.people).name} — ${seg.merged} ${words.merged}, ${seg.open} ${words.open}`}
              >
                <span
                  className="text-ink-dim font-mono text-[10px] leading-none"
                  data-kit-throughput-value=""
                >
                  {total || ""}
                </span>
                <div className="flex w-full flex-1 flex-col justify-end">
                  <div
                    className="bg-orange w-full rounded-t-[1px]"
                    data-kit-throughput-open=""
                    style={{ height: `${(seg.open / ceiling) * 100}%` }}
                  />
                  <div
                    className="bg-green w-full"
                    data-kit-throughput-merged=""
                    style={{ height: `${(seg.merged / ceiling) * 100}%` }}
                  />
                </div>
                <Avatar face={face(key, spec.people)} />
              </div>
            )
          })}
        </div>
      </div>

      <div className="text-ink-faint flex items-center gap-3 font-mono text-[10px] leading-none">
        <span className="flex items-center gap-1">
          <span className="bg-green inline-block size-2 rounded-[1px]" />
          {words.merged}
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-orange inline-block size-2 rounded-[1px]" />
          <span data-kit-throughput-legend-open="">{words.open}</span>
        </span>
      </div>

      {decoded.days.length > 1 ? (
        <Scrubber
          spec={{
            key: "day",
            steps: decoded.days.length,
            value: last,
            label: "Day",
            ends: [
              shortDate(decoded.days[0].date),
              shortDate(decoded.days[last].date),
            ],
          }}
        />
      ) : null}

      {/* The series the runtime scrubs through. Inert JSON, same channel the
          shell uses for `state` — a script tag the browser will not execute. */}
      <script
        type="application/json"
        data-kit-throughput-series=""
        dangerouslySetInnerHTML={{
          __html: escapeContextBlock(
            JSON.stringify({
              views: views.map((v) => ({ key: v.key, series: v.series })),
              people: payloadPeople(spec.people),
              legend: words,
            }),
          ),
        }}
      />
    </div>
  )
}
