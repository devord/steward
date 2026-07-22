/**
 * The curated connector vocabulary — the claude.ai *directory* connectors
 * the add/edit dialog offers as toggles, by canonical sanitized name
 * (ADR-0046). Directory names are stable across accounts, so they may ship
 * in the product; account-specific customs (a team's own MCP server) must
 * not — those reach the dialog through the pool-in-use union instead
 * (routines already naming them) and through stored values round-tripping.
 * The stored string is always the machine name; `connectorLabel` is display
 * only (per-string mono rule: the YAML keeps the honest string).
 */
export const CONNECTOR_CATALOG: readonly string[] = [
  "Atlassian-Rovo",
  "Figma",
  "Gmail",
  "Google-Calendar",
  "Google-Drive",
  "Linear",
  "Notion",
  "Slack",
]

/**
 * Friendly display of a machine name: `Google-Calendar` → "Google Calendar".
 * Both separators — claude.ai sanitizes to `[a-zA-Z0-9_-]`, and names
 * authored before ADR-0046 drifted to underscores.
 */
export function connectorLabel(name: string): string {
  return name.replaceAll(/[-_]/g, " ")
}
