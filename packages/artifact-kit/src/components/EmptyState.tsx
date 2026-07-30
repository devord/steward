/**
 * A designed empty state, never a blank tile or an error.
 *
 * "No data" is a real outcome a routine can report, and reporting it well is
 * the difference between a widget that says *nothing is owed* and one that
 * looks broken. The distinction the standard draws: an empty state is part of
 * the artifact, so it gets the same care as a full one.
 */
export function EmptyState({
  /** What is true, in the reader's terms: "No gaps — the code matches the spec". */
  headline,
  /** Optional next step, when there is one the reader can actually take. */
  detail,
}: {
  headline: string
  detail?: string
}) {
  return (
    <div className="flex flex-col items-center gap-1 py-4 text-center">
      <p className="text-ink m-0 text-sm">{headline}</p>
      {detail ? (
        <p className="text-ink-dim m-0 max-w-[48ch] text-sm">{detail}</p>
      ) : null}
    </div>
  )
}
