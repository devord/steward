import type { ReactNode } from "react"

import { KIT_VERSION } from "./index.ts"

/**
 * Everything §4, §5 and §9 of the widget standard require, in one place, so no
 * routine template ever restates them. Before the kit, each of these was a
 * paragraph of prose the model re-implemented per run — which is how three
 * divergent copies of the same footer, meta and context block ended up in the
 * published corpus.
 */
export interface ShellProps {
  /** The routine slug. Names the artifact in its standalone footer. */
  slug: string
  /**
   * The document's heading. Usually not painted — the widget card supplies a
   * visible title on the board — but the sections still need a root, so it is
   * rendered screen-reader-only rather than omitted.
   */
  title?: string
  /** ISO-8601 UTC. Drives both the meta stamp and the visible footer. */
  generatedAt: string
  /** The compiled kit stylesheet, inlined — see the note on self-containment. */
  css: string
  /**
   * The Chat-with-Claude briefing (ADR-0043). Markdown, richer than the
   * render: what the tile cropped, the caveats, and a closing
   * `## Ask me about`. Omit it and the board simply shows no button.
   */
  context?: string
  /**
   * Inert JSON the artifact carries for its own next run — a series to append
   * to, an alert level to compare against, the ask set as gathered. Three
   * corza routines already do this by hand under different names; one shape
   * means the board and a follow-up run read them the same way.
   *
   * `application/json` is not executed or rendered, so it costs no layout and
   * no request. It is published, so the disclosure rules of the visible
   * render apply to it too.
   */
  state?: { id: string; data: unknown }[]
  children: ReactNode
}

/** `YYYY-MM-DD HH:MMZ` — the compact footer stamp the standard specifies. */
export function footerTimestamp(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}Z`
}

/**
 * Only the literal string `</script>` ends a script element, so a briefing
 * that quotes markup has to break it up or the block truncates there — taking
 * the rest of the briefing with it, silently, in a file nobody re-reads.
 */
export function escapeContextBlock(text: string): string {
  return text.replace(/<\/script/gi, "<\\/script")
}

export function Shell({
  slug,
  title,
  generatedAt,
  css,
  context,
  state,
  children,
}: ShellProps) {
  return (
    <html lang="en">
      <head>
        {/* React 19 renders this as `charSet`; HTML attribute names are
            case-insensitive, so the parser reads it as `charset` and the
            document is UTF-8. Verified, not assumed. */}
        <meta charSet="utf-8" />
        <meta name="widget-generated-at" content={generatedAt} />
        {/* The board injects the *current* kit.css over artifacts published
            months ago. This stamp is how it can tell that the class contract
            has moved past what this file was compiled against. */}
        <meta name="steward-kit-version" content={KIT_VERSION} />
        <title>{slug}</title>
        {/* Inlined, not linked: the frame has no network, and the file must
            still read when opened raw off the artifacts branch. The board
            appends its own copy afterwards, which is what lets a design fix
            land without rerunning the routine. */}
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body className="bg-bg1 text-ink m-0 font-sans text-sm">
        {/* No max-width and no centering. Content sizes to what it needs and
            surplus width lands as one trailing gutter — which is what a
            shrink-to-fit table does anyway. Capping the page would reintroduce
            the mid-row hole the column work exists to remove.

            `tile:p-2.5` is {@link TILE_INSET_PX}, and it is a shared edge, not
            a local choice: the board's widget title, skeleton and band heading
            all inset to match, because chrome floating over a flush artifact
            has no divider to excuse a different one. Keep the literal and the
            constant in step — `tile-inset.test.ts` fails if they part. */}
        <main className="tile:p-2.5 page-only:p-5 flex flex-col gap-3">
          <h1 className="sr-only">{title ?? slug}</h1>
          {children}
        </main>
        {/* Standalone chrome only. On the board the widget card already shows
            the routine name and freshness, so the frame hides this rather than
            print the identity twice. */}
        <footer className="text-ink-dim tile:px-2.5 page-only:px-5 flex justify-between pb-2 font-mono text-xs">
          <span>{slug}</span>
          <span>{footerTimestamp(generatedAt)}</span>
        </footer>
        {(state ?? []).map((b) => (
          <script
            key={b.id}
            type="application/json"
            id={b.id}
            // `</script>` inside a JSON string would end the element early;
            // escaping the slash keeps the payload parseable.
            // Same hazard, same escape as the context block — a `</script`
            // inside a JSON string would end the element early.
            dangerouslySetInnerHTML={{
              __html: escapeContextBlock(JSON.stringify(b.data)),
            }}
          />
        ))}
        {context ? (
          <script
            type="text/markdown"
            id="steward-context"
            dangerouslySetInnerHTML={{ __html: escapeContextBlock(context) }}
          />
        ) : null}
      </body>
    </html>
  )
}
