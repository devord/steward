import { z } from "zod"

import { slugSchema } from "./routine.ts"

export const GRID_MAX_COLS = 4
export const GRID_MAX_ROWS = 4

export const widgetSizeSchema = z.object({
  cols: z.number().int().min(1).max(GRID_MAX_COLS),
  rows: z.number().int().min(1).max(GRID_MAX_ROWS),
})

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

/** Repo path of a dashboard's layout file; the slug is the filename. */
export function dashboardPath(slug: string): string {
  return `${DASHBOARDS_DIR}/${slugSchema.parse(slug)}.yaml`
}

/** Shape of data/dashboards/<slug>.yaml in a data repo. */
export const dashboardFileSchema = z.object({
  /** Display title; UI falls back to the slug when absent. */
  name: z.string().min(1).optional(),
  grid: z.object({
    columns: z.number().int().min(1).max(GRID_MAX_COLS).default(4),
    rowHeight: z.number().int().positive().default(150),
  }),
  widgets: z.array(widgetSchema),
})

export type WidgetSize = z.infer<typeof widgetSizeSchema>
export type Widget = z.infer<typeof widgetSchema>
export type DashboardFile = z.infer<typeof dashboardFileSchema>
