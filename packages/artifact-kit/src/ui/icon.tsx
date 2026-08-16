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
type GlyphPart =
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

  // Review and check states. Healthy states whisper — a passing check is a
  // bare `check`, not a filled green circle, so the column reads as texture
  // until something is actually wrong.
  check: [["path", { d: "M20 6 9 17l-5-5" }]],
  "circle-x": [
    ["circle", { cx: "12", cy: "12", r: "10" }],
    ["path", { d: "m15 9-6 6" }],
    ["path", { d: "m9 9 6 6" }],
  ],
  pencil: [
    [
      "path",
      {
        d: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
      },
    ],
    ["path", { d: "m15 5 4 4" }],
  ],
  info: [
    ["circle", { cx: "12", cy: "12", r: "10" }],
    ["path", { d: "M12 16v-4" }],
    ["path", { d: "M12 8h.01" }],
  ],

  // Direction, as geometry rather than judgement — a rising bad number and a
  // rising good one both point up. `minus` is the honest "no movement" mark:
  // a rule in the same stroke language as its neighbours, where the `·` it
  // replaces was a 1px speck from a different visual class entirely.
  "arrow-up": [
    ["path", { d: "m5 12 7-7 7 7" }],
    ["path", { d: "M12 19V5" }],
  ],
  "arrow-down": [
    ["path", { d: "M12 5v14" }],
    ["path", { d: "m19 12-7 7-7-7" }],
  ],
  minus: [["path", { d: "M5 12h14" }]],
  /** Leaves the artifact — the mark on an outbound link. */
  "arrow-up-right": [
    ["path", { d: "M7 7h10v10" }],
    ["path", { d: "M7 17 17 7" }],
  ],
  /** Both ways at once: two things that move together. */
  "move-horizontal": [
    ["path", { d: "m18 8 4 4-4 4" }],
    ["path", { d: "M2 12h20" }],
    ["path", { d: "m6 8-4 4 4 4" }],
  ],
  /**
   * The disclosure caret. Drawn pointing *down* — open — and rotated a quarter
   * turn by CSS when its group folds, so one shape carries both states and the
   * rotation is the state change rather than a swap between two glyphs.
   */
  "chevron-down": [["path", { d: "m6 9 6 6 6-6" }]],
} satisfies Record<string, GlyphPart[]>

export type IconName = keyof typeof ICONS

/**
 * A glyph set inside a run of text, optically centred on the figures beside it.
 *
 * **Why these are icons and not characters.** The board injects the *latin
 * subset* of Geist Mono (`artifact-font.ts`, ~30 kB), so any codepoint outside
 * it silently falls back to whatever face the OS offers. Measured against the
 * injected file at 100px: `M` and `0` advance 60.00 and rise to 71.0/72.6,
 * while `▲`/`▼` (U+25B2/BC) advance 60.21 and span 55.76 up to 3.81 *below*
 * the baseline the digits sit on — a different face, mid-string, with a
 * different weight and a different vertical position per platform. `↔`
 * (U+2194) and `↗` (U+2197) fall out of the subset the same way. Drawing them
 * instead puts their size and alignment inside the design system.
 *
 * `0.85em` with a `-0.06em` shift centres the glyph on the figure block: mono
 * digits rise 0.726em off the baseline, so their optical centre is 0.363em up,
 * and a baseline-aligned box of side S has its centre at S/2 — the shift is
 * the difference. Baseline alignment alone (the SVG default) hangs the glyph
 * low, which is the other half of what made the text triangles read as loose.
 *
 * Sized to cost about what it replaced. A drawn glyph is free to be any width,
 * which is the trap: at `0.9em` plus explicit margins each delta ran 8px wider
 * than the `▲` it stands in for, and a ledger is where 8px × every row decides
 * whether a column clips. Lucide's own sidebearing — the arrow's ink spans 14
 * of 24 units — is the gap, so the callers add a leading margin and nothing
 * between the glyph and its figure.
 */
export const INLINE_GLYPH = "inline size-[0.85em] align-[-0.06em]"

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
  const parts: readonly GlyphPart[] = ICONS[name]
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
      {parts.map((s, i) =>
        s[0] === "circle" ? (
          <circle key={i} cx={s[1].cx} cy={s[1].cy} r={s[1].r} />
        ) : (
          <path key={i} d={s[1].d} />
        ),
      )}
    </svg>
  )
}
