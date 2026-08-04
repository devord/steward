import { cn } from "../ui/cn.ts"
import { Icon, type IconName, INLINE_GLYPH } from "../ui/icon.tsx"

/** The status ladder. `pending` is "not read yet", never a fourth severity. */
export type VerdictLevel = "good" | "attn" | "bad" | "pending"

/**
 * Colour and glyph per level, together — they are one statement and must not
 * be settable apart. A verdict painted without its icon is colour alone, which
 * fails colour-vision deficiency, grayscale and `forced-colors` at once.
 *
 * Orange for `attn`, never yellow: yellow is the board's carry-over /
 * record-in-doubt tone, and the amber step reads truer against the word.
 *
 * There used to be a third member here, a filled dot before the word, defended
 * as the colour leg of "three redundant encodings". It was not one. The word
 * is already painted `text`, so the dot restated a channel the group carried
 * twice over while adding nothing a reader without colour could use — the
 * silhouette is what survives grayscale and `forced-colors`, and that is the
 * glyph's job. What it did add was width, on the tier with none to spare:
 * measured at 340×160, `Reshuffled` plus a dot pushed the glyph onto a second
 * line at every size from 0.22em up, on the tile where the word IS the
 * artifact. Two marks, each carrying something the other cannot.
 */
const LEVEL: Record<VerdictLevel, { text: string; icon: IconName }> = {
  good: { text: "text-green", icon: "circle-check" },
  attn: { text: "text-orange", icon: "triangle-alert" },
  bad: { text: "text-red", icon: "octagon-alert" },
  pending: { text: "text-ink-dim", icon: "clock" },
}

/** One fired condition: connecting prose around a measured figure. */
export interface VerdictClause {
  /** Plain words before the figure. */
  lead?: string
  /** The measured figure — the only thing bolded, in full ink. */
  value: string
  /** Plain words after. */
  tail?: string
  /** Keys this clause cites, each linked out. */
  refs?: { label: string; href?: string }[]
}

export interface Verdict {
  level: VerdictLevel
  /** The hero word — `GREEN` / `AMBER` / `RED` / `PENDING`. */
  word: string
  /**
   * The anchor everything below is measured against — "Aug 6 gate · 7 days
   * out". Sits beside the word from the moment there is a second line to
   * qualify: a reader who has to remember the gate is doing arithmetic the
   * tile should have done.
   */
  gate?: string
  /** Fired conditions, highest severity first. */
  clauses?: VerdictClause[]
  /**
   * The completeness caveat — set it only when something could not be
   * evaluated. It is what keeps an amber from reading as "checked, not red".
   */
  caveat?: string
  /** Attribution when a human overrode or attested the computed colour. */
  note?: string
}

/**
 * The one-word status read: the word and a glyph.
 *
 * **Two encodings by construction, and neither is colour.** The level picks
 * both together, so no caller can ship colour alone — the word names the state
 * and the silhouette ranks it, which is what survives colour-vision
 * deficiency, grayscale and `forced-colors`. Colour rides on top of both and
 * is never asked to carry the reading on its own. Adding a third mark that
 * carries only colour does not make that stronger; see `LEVEL`.
 *
 * **The accent budget is spent here and nowhere else.** Everything below the
 * word — the clauses, the caveat, the override note — is the neutral ink ramp.
 * This has been broken once in production: a render painted `FIRED` orange on
 * three trace rows plus an orange resolution arrow, putting five orange strings
 * under the one word supposed to own the tone. Fired conditions earn prominence
 * from ink and weight against dimmer peers, never from a second colour. If you
 * reach for colour to mark what fired, the ordering is doing too little work.
 */
export function VerdictBand({ verdict }: { verdict: Verdict }) {
  const l = LEVEL[verdict.level]
  return (
    <div className="flex flex-col gap-1.5">
      {/* Centred at the glance, a left-aligned header everywhere above it —
          the same shape StatTier takes, for the same reason: at 340×160 the
          word IS the artifact and belongs in the middle of the tile, and on
          any larger tier that treatment is a 1×1 design that outstayed its
          tier. This band used to skip the centring and sit in the top-left
          corner of an otherwise empty glance.

          Wrapping, because the row can hold four things. `gap-x` alone would
          leave the wrapped line touching the one above it. */}
      <div className="beyond-glance:justify-start beyond-glance:text-left flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1 text-center">
        {/* A machine verdict, so it takes the mono register.

            The step-down is gated on `beyond-glance`, not on width: the tier
            that adds the reason line, the caveat and the note is exactly the
            tier where the word stops being the whole artifact, and every one
            of those lines is already gated on it. Gating the word on
            `tier-detail` instead put the step 360px of width later, so a 1×2
            and a 2×2 tile ran a 44px hero over a 14px sentence — three times
            the next thing on screen, on a tile whose job is the ledger.

            The glyph sizes in `em` off this same span, so one number sets the
            pair per tier instead of two scales drifting apart. It was a fixed
            24px against a word that ranged from 24 to 44, which reads as an
            undersized afterthought at the glance and an oversized one below.

            A run of text with a glyph set into it, NOT a flex row — and that
            is load-bearing rather than tidiness. A flex container takes its
            baseline from its first flex item, and when that item is a box with
            no text of its own the baseline gets synthesised from its bottom
            edge. With the dot leading the row that is exactly what happened:
            the parent aligns the gate on `items-baseline`, so "Aug 6 · 3d" sat
            5.9px above the baseline of the word it qualifies — measured, and
            landing precisely on the dot's bottom edge. Inline flow has no such
            rule. The span's baseline is the word's baseline, so the gate sits
            on the line the reader sees, and it stays fixed even if something
            is ever set before the word again.

            `align-[-0.05em]` centres the glyph on the CAP BAND rather than on
            the line box. Geist Mono's caps rise 0.7em off the baseline, so the
            band's centre is 0.35em up; a baseline-aligned box of side S has
            its own centre at S/2, and the shift is the difference. Centring on
            the line box instead hangs the glyph low, because a word with no
            descenders leaves the descent space empty. Same arithmetic as
            `INLINE_GLYPH`, one tier larger. */}
        <span
          className={cn(
            "beyond-glance:text-2xl font-mono text-[2.75rem] leading-none font-semibold",
            l.text,
          )}
        >
          {verdict.word}
          <Icon
            name={l.icon}
            className="ml-[0.2em] inline size-[0.8em] align-[-0.05em]"
          />
        </span>
        {verdict.gate ? (
          // Beside the word, not at the far edge. `ml-auto` on an unbounded
          // row parked the anchor 1000px away from the thing it anchors at the
          // full view, and at 340 wide it overflowed the tile outright — a
          // `shrink-0` span that neither wrapped nor truncated, so "out" ran
          // off the right edge. That is the silent crop ADR-0019 forbids, on
          // the one line that says what the verdict is measured against.
          // The extra margin is not decoration: at `gap-x-2` the gate butts
          // against the level glyph and the two read as one object.
          <span className="text-ink-dim beyond-glance:block ml-1 hidden font-mono text-xs">
            {verdict.gate}
          </span>
        ) : null}
      </div>

      {verdict.clauses?.length ? (
        // The clauses open the line. The old shape led with the word again,
        // spending the sentence's most-scanned token restating the word
        // directly above it.
        //
        // Trimmable, and its own fit section so shedding it cannot collapse
        // anything else. Without this the band had no units at all and a short
        // tile cropped it mid-sentence — the silent crop ADR-0019 forbids.
        <p
          data-fit-section
          data-fit-list
          className="text-ink-dim beyond-glance:block m-0 hidden font-sans text-sm"
        >
          {/* One unit for the WHOLE line, not one per clause: a reason list
              trimmed mid-way still reads as complete, so half a reason is
              worse than none. */}
          <span data-fit-item>
            {verdict.clauses.map((c, i) => (
              <span key={i}>
                {i > 0 ? " · " : ""}
                {c.lead ? `${c.lead} ` : ""}
                <strong className="text-ink font-semibold">{c.value}</strong>
                {c.tail ? ` ${c.tail}` : ""}
                {c.refs?.length ? (
                  <>
                    {" ("}
                    {c.refs.map((r, j) => (
                      <span key={r.label}>
                        {j > 0 ? ", " : ""}
                        {r.href ? (
                          <a
                            href={r.href}
                            target="_blank"
                            rel="noopener"
                            className="text-ink-dim hover:text-orange underline decoration-transparent underline-offset-2 hover:decoration-current"
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
              </span>
            ))}
          </span>
        </p>
      ) : null}

      {verdict.caveat ? (
        // Full ink at body size, and its own line — never the tail of the
        // reason line, where as a fourth clause it is read last if at all,
        // which is the opposite of its importance. Never the verdict's colour:
        // it qualifies the verdict rather than restating it.
        //
        // A run of text with the glyph set into it, NOT a flex row — the same
        // rule the hero above obeys, and broken here for a while. A flex item
        // ignores `vertical-align`, so `items-baseline` could only align this
        // row on the wrapper's SYNTHESISED baseline: the glyph's bottom margin
        // edge. Measured in the render, that hung the clock's centre 0.183em
        // above the cap band beside it — a full 1em box sitting entirely off a
        // line whose caps rise 0.704em — while every other glyph in the kit
        // ran within 0.071em of its own. Inline flow plus `INLINE_GLYPH` puts
        // it at 0.049em, in family with the rest.
        <p className="text-ink beyond-glance:block m-0 hidden font-sans text-sm">
          <Icon
            name="clock"
            className={`${INLINE_GLYPH} text-ink-dim mr-1.5`}
          />
          {verdict.caveat}
        </p>
      ) : null}

      {verdict.note ? (
        // Last in the DOM, so bottom-up trimming sheds it before the reason
        // line above — which is the right order: the attribution qualifies a
        // verdict the reader can already see and act on.
        <p
          data-fit-section
          data-fit-list
          className="text-ink-dim beyond-glance:block m-0 hidden font-mono text-xs"
        >
          <span data-fit-item>{verdict.note}</span>
        </p>
      ) : null}
    </div>
  )
}
