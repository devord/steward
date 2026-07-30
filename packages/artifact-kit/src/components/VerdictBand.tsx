import { cn } from "../ui/cn.ts"
import { Icon, type IconName } from "../ui/icon.tsx"

/** The status ladder. `pending` is "not read yet", never a fourth severity. */
export type VerdictLevel = "good" | "attn" | "bad" | "pending"

/**
 * Colour and glyph per level, together — they are one statement and must not
 * be settable apart. A verdict painted without its icon is colour alone, which
 * fails colour-vision deficiency, grayscale and `forced-colors` at once.
 *
 * Orange for `attn`, never yellow: yellow is the board's carry-over /
 * record-in-doubt tone, and the amber step reads truer against the word.
 */
const LEVEL: Record<
  VerdictLevel,
  { text: string; dot: string; icon: IconName }
> = {
  good: { text: "text-green", dot: "bg-green", icon: "circle-check" },
  attn: { text: "text-orange", dot: "bg-orange", icon: "triangle-alert" },
  bad: { text: "text-red", dot: "bg-red", icon: "octagon-alert" },
  pending: { text: "text-ink-dim", dot: "bg-ink-dim", icon: "clock" },
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
   * out". Pushed to the far edge of the verdict's own line, from the compact
   * tier: a reader who has to remember the gate is doing arithmetic the tile
   * should have done.
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
 * The one-word status read: a dot, the word, and a glyph.
 *
 * **Three redundant encodings by construction.** The level picks all three
 * together, so no caller can ship colour alone — the state survives
 * colour-vision deficiency, grayscale and `forced-colors` because two of the
 * three carry no colour at all.
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
      <div className="flex items-baseline gap-2">
        <span
          className={cn("size-2 shrink-0 self-center rounded-full", l.dot)}
          aria-hidden="true"
        />
        {/* A machine verdict, so it takes the mono register. Sized against the
            tile rather than the body scale — at 340×160 this word IS the
            artifact. */}
        <span
          className={cn(
            "tier-detail:text-2xl font-mono text-[2.75rem] leading-none font-semibold",
            l.text,
          )}
        >
          {verdict.word}
        </span>
        <span className={cn("tier-detail:text-xl shrink-0 text-2xl", l.text)}>
          <Icon name={l.icon} />
        </span>
        {verdict.gate ? (
          // Far edge, from the compact tier up: at the glance there is room for
          // the verdict and nothing else.
          <span className="text-ink-dim beyond-glance:block ml-auto hidden shrink-0 font-mono text-xs">
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
        <p className="text-ink beyond-glance:flex m-0 hidden items-baseline gap-1.5 font-sans text-sm">
          <span className="text-ink-dim shrink-0" aria-hidden="true">
            <Icon name="clock" />
          </span>
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
