/**
 * A trend, inline and at row scale.
 *
 * Deliberately axis-less and label-less: it says *shape* — rising, falling,
 * flat, spiky — beside a number that already says magnitude. A sparkline that
 * needs a scale to be read is a chart in the wrong place.
 *
 * **Never the only carrier of a direction.** The row states the direction in
 * words or an arrow beside it; this is the texture under that claim, so a
 * reader who cannot resolve 40×12 pixels loses nothing they needed.
 */
export function Sparkline({
  points,
  label,
}: {
  /** Oldest to newest. Fewer than two renders nothing. */
  points: number[]
  /** What the shape is of — read instead of the line, not after it. */
  label: string
}) {
  if (points.length < 2) return null
  const W = 40
  const H = 12
  const lo = Math.min(...points)
  const hi = Math.max(...points)
  // A flat series has no range to normalise against. Draw it on the midline
  // rather than dividing by zero — flat is a real shape and it should read as
  // one, not vanish.
  const span = hi - lo || 1
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * W
      const y = H - ((p - lo) / span) * H
      return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(" ")
  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className="inline-block overflow-visible align-middle"
      role="img"
      aria-label={label}
    >
      <path
        d={d}
        fill="none"
        className="stroke-ink-faint"
        strokeWidth={1}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
