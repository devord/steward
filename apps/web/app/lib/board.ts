/** Board addressing shared by server loaders and client navigation. */

export type BoardScope = "personal" | "team"

/** Slug of the board `/` renders; every data repo starts with it. */
export const DEFAULT_DASHBOARD = "main"

/** Route of a board — `/` keeps owning the personal default. */
export function boardHref(scope: BoardScope, slug: string): string {
  if (scope === "team") return `/team/${slug}`
  return slug === DEFAULT_DASHBOARD ? "/" : `/d/${slug}`
}
