/**
 * A ghost button that copies a payload the tile is too small to show.
 *
 * The row is triage; the payload is the thing you actually paste somewhere —
 * a ready-to-run prompt, a ticket body, a query. Carrying it in a data
 * attribute rather than rendering it keeps the tile readable while still
 * making the artifact the complete deliverable.
 *
 * Rendered `hidden`, revealed by the board's injected behaviour. That ordering
 * is deliberate: a raw-opened file has no behaviour attached, and a button
 * that looks clickable and does nothing is worse than no button. Same
 * progressive-enhancement rule ADR-0039 sets for person-relative content —
 * the static render has to be honest on its own.
 */
export function CopyAction({
  payload,
  label = "copy",
}: {
  /** What lands on the clipboard. */
  payload: string
  label?: string
}) {
  return (
    <button
      type="button"
      hidden
      data-kit-copy
      data-kit-copy-payload={payload}
      data-kit-copy-label={label}
      className="border-border-dim text-ink-dim hover:text-ink hover:border-border rounded-sm border px-1.5 py-0.5 font-mono text-xs leading-none"
    >
      {label}
    </button>
  )
}
