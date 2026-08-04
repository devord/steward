export interface Face {
  /** The person's display name — hover text and the sr-only label. */
  name: string
  /** A `data:` URI. Anything else is dropped: the sandbox has no network. */
  src?: string
  /** Where the face points — a profile, opened in a new tab. */
  href?: string
}

/**
 * A person, as a face.
 *
 * **`src` must be a data URI.** A remote avatar host is unreachable from the
 * sandbox and, worse, from a scheduled run: the fetch that used to lead the
 * resolution chain reached `avatars.githubusercontent.com`, so every row
 * degraded to an initial on exactly the runs nobody was watching (ADR-0044).
 * The kit drops a non-`data:` src rather than emitting a request that cannot
 * succeed — a silent initial is better than a broken image, and the routine's
 * people registry is the fix.
 *
 * The initial is not a fallback that needs JS. It renders underneath, and the
 * image simply covers it when there is one.
 */
export function Avatar({ face }: { face: Face }) {
  const inline = face.src?.startsWith("data:") ? face.src : undefined
  // Belt as well as braces. `validateDoc` requires the name and is what a
  // routine actually hits, but this component is exported, and a thrown
  // "Cannot read properties of undefined" from a minified renderer is the
  // least useful failure in the pipeline.
  const name = face.name?.trim() || "?"
  const initial = [...name][0]?.toUpperCase() ?? "?"
  const glyph = (
    <span
      // The name rides `title` so hover answers "whose is this?" with a real
      // name — a column of faces is unreadable otherwise.
      title={name}
      // 12px, not 10: the floor is a floor even for a glyph-ish initial
      // (widget-standard §6), and the rule lands in the shared stylesheet, so
      // one 10px declaration here failed the contract check on every artifact
      // — including ones with no avatar on them.
      className="bg-bg2 text-ink-dim relative inline-flex size-[18px] shrink-0 items-center justify-center overflow-hidden rounded-full font-mono text-xs leading-none"
    >
      {initial}
      {inline ? (
        <img
          src={inline}
          alt=""
          className="absolute inset-0 size-full rounded-full object-cover"
        />
      ) : null}
      <span className="sr-only">{name}</span>
    </span>
  )
  return face.href ? (
    // In-frame navigation is sandbox-blocked (ADR-0028): a bare href is dead.
    //
    // `inline-flex` so the anchor is exactly as tall as the face inside it. A
    // plain <a> is a line box, so it inherits the strut of whatever font-size
    // it lands in — 20px around an 18px face in the throughput column — and
    // those two extra pixels are invisible until something has to line up with
    // the face's row, which is what threw the chart's zero tick 2px below its
    // own baseline.
    <a className="inline-flex" href={face.href} target="_blank" rel="noopener">
      {glyph}
    </a>
  ) : (
    glyph
  )
}
