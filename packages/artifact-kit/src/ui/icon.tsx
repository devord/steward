/**
 * The icon set, as committed shape data.
 *
 * Lifted verbatim from `lucide-react` v1.23.0 (ISC), which `apps/web` already
 * depends on — same `__iconNode` tuples, same order, circles left as circles.
 * Copied rather than imported: the kit is headless with no app dependency,
 * React here is build-time only, and pulling a barrel for four glyphs would put
 * a dependency in `render.mjs` for bytes that flatten to inline SVG anyway.
 * Keeping the data in lucide's own shape is what makes "did this drift?" a
 * diff rather than a judgment.
 *
 * Adding one: copy its `__iconNode` out of
 * `apps/web/node_modules/lucide-react/dist/esm/icons/<name>.mjs`.
 */
type Shape =
  | ["path", { d: string }]
  | ["circle", { cx: string; cy: string; r: string }]

const ICONS = {
  // The escalating status family: circle → triangle → octagon is the road-sign
  // ladder, so the silhouette alone says which end of the scale a reader is on
  // before any colour resolves.
  "circle-check": [
    ["circle", { cx: "12", cy: "12", r: "10" }],
    ["path", { d: "m9 12 2 2 4-4" }],
  ],
  "triangle-alert": [
    [
      "path",
      {
        d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",
      },
    ],
    ["path", { d: "M12 9v4" }],
    ["path", { d: "M12 17h.01" }],
  ],
  "octagon-alert": [
    ["path", { d: "M12 16h.01" }],
    ["path", { d: "M12 8v4" }],
    [
      "path",
      {
        d: "M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z",
      },
    ],
  ],
  clock: [
    ["circle", { cx: "12", cy: "12", r: "10" }],
    ["path", { d: "M12 6v6l4 2" }],
  ],
} satisfies Record<string, Shape[]>

export type IconName = keyof typeof ICONS

/**
 * A glyph, sized to the text beside it.
 *
 * `aria-hidden` throughout: every icon the kit renders sits next to the word it
 * duplicates, which is the whole point of shipping both. Announcing it would
 * read the state twice.
 */
export function Icon({
  name,
  className,
}: {
  name: IconName
  className?: string
}) {
  const shapes: readonly Shape[] = ICONS[name]
  return (
    <svg
      viewBox="0 0 24 24"
      // `em` rather than a fixed size, so a glyph tracks whatever text it was
      // placed beside instead of needing a variant per context.
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {shapes.map((s, i) =>
        s[0] === "circle" ? (
          <circle key={i} cx={s[1].cx} cy={s[1].cy} r={s[1].r} />
        ) : (
          <path key={i} d={s[1].d} />
        ),
      )}
    </svg>
  )
}
