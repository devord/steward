import { z } from "zod"

import { slugSchema } from "./routine.ts"

/**
 * Grid resolution ceilings. `GRID_MAX_COLS` is the widest a board may be
 * authored at; a given dashboard's own `grid.columns` (≤ this) is the count
 * that actually renders and bounds placement. Rows are unbounded in
 * position but a single widget spans at most `GRID_MAX_ROWS` — enough for a
 * full-height feed/agenda/log without letting one cell swallow the board.
 */
export const GRID_MAX_COLS = 6
export const GRID_MAX_ROWS = 12

export const widgetSizeSchema = z.object({
  cols: z.number().int().min(1).max(GRID_MAX_COLS),
  rows: z.number().int().min(1).max(GRID_MAX_ROWS),
})

/**
 * Named widget shapes offered in the add wizard — the calm alternative to
 * two raw cols×rows steppers. Intents, not dimensions: a `wide` strip, a
 * `tall` feed, a `hero` primary. Columns are clamped to the board's own
 * `grid.columns` at pick time, so a preset never overflows a narrow board.
 * The steppers remain, one "custom" click away, for anything off-preset.
 */
export const WIDGET_SIZE_PRESETS = [
  { id: "small", cols: 1, rows: 1 },
  { id: "medium", cols: 2, rows: 2 },
  { id: "wide", cols: 4, rows: 1 },
  { id: "tall", cols: 2, rows: 3 },
  { id: "hero", cols: 4, rows: 3 },
] as const

export type WidgetSizePreset = (typeof WIDGET_SIZE_PRESETS)[number]["id"]

export const widgetSchema = z.object({
  /** Slug of the routine whose artifact this widget renders. */
  routine: slugSchema,
  position: z.object({
    col: z.number().int().min(1).max(GRID_MAX_COLS),
    row: z.number().int().min(1),
  }),
  size: widgetSizeSchema,
})

/** Directory holding one layout file per dashboard in a data repo. */
export const DASHBOARDS_DIR = "data/dashboards"

/** Ceiling for a dashboard's section name — a rail sub-heading, not a
    paragraph. Keeps the rail label short. */
export const SECTION_NAME_MAX = 40

/** Repo path of a dashboard's layout file; the slug is the filename. */
export function dashboardPath(slug: string): string {
  return `${DASHBOARDS_DIR}/${slugSchema.parse(slug)}.yaml`
}

/** Shape of data/dashboards/<slug>.yaml in a data repo. */
export const dashboardFileSchema = z
  .object({
    /** Section this board belongs to in the rail — a free-text label the
        viewer authors (e.g. "Clients", "Projects"). Boards sharing a value
        cluster under one sub-heading inside their repo group; absent → the
        board leads the group's unlabeled section. Order across sections is
        set by the repo's `sections` list (data/repo.yaml), not here. */
    section: z.string().min(1).max(SECTION_NAME_MAX).optional(),
    grid: z.object({
      columns: z.number().int().min(1).max(GRID_MAX_COLS).default(4),
      rowHeight: z.number().int().positive().default(150),
      /**
       * Canvas cap. `fixed` centers the board at a comfortable reading width
       * (today's behavior); `wide` lets it fill a large monitor so the extra
       * columns get real estate instead of stretching every widget into a
       * letterbox. Width and column count are one decision — see ADR notes.
       */
      width: z.enum(["fixed", "wide"]).default("fixed"),
    }),
    widgets: z.array(widgetSchema),
  })
  // A widget must fit the board it lives on: its right edge can't run past
  // the dashboard's own column count. The per-field `max(GRID_MAX_COLS)` only
  // guards the ceiling; this ties each widget to *this* board's width, so a
  // hand-authored layout that overflows the grid is rejected, not silently
  // clipped at render.
  .superRefine((file, ctx) => {
    for (const [i, w] of file.widgets.entries()) {
      if (w.position.col + w.size.cols - 1 > file.grid.columns) {
        ctx.addIssue({
          code: "custom",
          path: ["widgets", i, "size", "cols"],
          message: `widget overflows the grid: col ${w.position.col} + ${w.size.cols} cols exceeds ${file.grid.columns} columns`,
        })
      }
    }
  })

export type WidgetSize = z.infer<typeof widgetSizeSchema>
export type Widget = z.infer<typeof widgetSchema>
export type DashboardFile = z.infer<typeof dashboardFileSchema>
