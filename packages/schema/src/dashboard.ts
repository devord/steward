import { z } from "zod"

import { slugSchema } from "./routine"

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

/** Shape of data/dashboard.yaml in a user's data repo. */
export const dashboardFileSchema = z.object({
  grid: z.object({
    columns: z.number().int().min(1).max(GRID_MAX_COLS).default(4),
    rowHeight: z.number().int().positive().default(150),
  }),
  widgets: z.array(widgetSchema),
})

export type WidgetSize = z.infer<typeof widgetSizeSchema>
export type Widget = z.infer<typeof widgetSchema>
export type DashboardFile = z.infer<typeof dashboardFileSchema>
