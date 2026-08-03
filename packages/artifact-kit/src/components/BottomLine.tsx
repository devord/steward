/** The sentence, and the keys it cites. */
export interface BottomLine {
  /**
   * One sentence, and a verdict rather than a summary — "Checkout is a week
   * from shippable; the payments integration is the only thing still in the
   * way", never "Several PRs were merged this week."
   */
  text: string
  /** Keys the sentence cites, trailing it and linked out. */
  refs?: { label: string; href?: string }[]
}

/**
 * The bottom line: the conclusion, above the evidence for it.
 *
 * **Why this is a band and not a `note`.** Every template that writes for a
 * reader who did not watch the work happen says "bottom line first", and until
 * this existed the only slots that took a sentence were `stat.note` and
 * `verdict.note` — 12px mono `ink-dim`, specified for "12 held back" and for
 * override attribution, and shed early by the fit pass. A `prose` band is the
 * other near-miss and is page-only by design, so it never reaches a tile at
 * all. The result was live: `corza-narrative` moved onto the kit, picked
 * `verdict` because its honest headline is a word, and its executive sentence
 * had nowhere to go — so the run simply stopped writing one, and the widget
 * became a ledger with a headline over it.
 *
 * **Full ink, one step above the body.** It outranks every row beneath it and
 * has to look like it. The accent budget is already spent on the glance word
 * directly above, so the rank is carried by ink and size — never a second
 * colour, which would put two things in the tile competing to be the loudest.
 *
 * **Not trimmable.** Every other band yields to the fit pass; this one is the
 * floor, because a tile that trimmed its way out of the conclusion is a tile
 * reporting the evidence for a verdict it no longer states. On a tile it
 * clamps instead, so a sentence that runs long degrades visibly at three lines
 * rather than pushing the ledger off the bottom.
 */
export function BottomLineBand({ line }: { line: BottomLine }) {
  return (
    // Two elements, and that split is load-bearing: `line-clamp` sets
    // `display: -webkit-box`, and on the same element it outranks `hidden` —
    // which put the sentence back on the 340×160 glance, under the word, in a
    // tier that has room for the word alone. The wrapper owns visibility, the
    // paragraph owns the clamp, and neither can undo the other.
    <div className="beyond-glance:block hidden">
      {/* Capped at 72ch. Read across a 2560px frame this is not a sentence, it
          is a line of a table — a wide page spends its width on a second
          column instead. */}
      {/* `text-pretty` across every prose surface in the kit — the conclusion,
          the dives, a ledger's why-line, an empty state. A measure that stops
          at a readable ceiling strands a one-word last line often enough to be
          the normal case, and an orphan under a full-width band reads as a
          layout fault rather than as a sentence ending. */}
      <p className="text-ink tile:line-clamp-3 m-0 max-w-[72ch] text-pretty font-sans text-base">
        {line.text}
        {line.refs?.length ? (
          <>
            {" ("}
            {line.refs.map((r, i) => (
              <span key={r.label}>
                {i > 0 ? ", " : ""}
                {r.href ? (
                  // In-frame navigation is sandbox-blocked (ADR-0028), so a
                  // bare href goes nowhere — every link is a new tab or dead.
                  <a
                    href={r.href}
                    target="_blank"
                    rel="noopener"
                    className="text-ink hover:text-orange underline decoration-transparent underline-offset-2 hover:decoration-current"
                  >
                    {r.label}
                  </a>
                ) : (
                  r.label
                )}
              </span>
            ))}
            {")"}
          </>
        ) : null}
      </p>
    </div>
  )
}
