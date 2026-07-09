/**
 * English — the source dictionary. Its keys define `MessageKey`; every
 * other locale must fill exactly this set (enforced by the type in
 * pt-br.ts). Keys are flat and dotted; `{name}` marks interpolation slots.
 * Voice per DESIGN.md: lowercase where natural, git words used plainly.
 */
export const en = {
  "landing.tagline":
    "A dashboard of living widgets — each one an HTML report that a scheduled routine regenerates.",
  "landing.sub": "Reports that update themselves.",
  "landing.signIn": "Sign in with GitHub",
  "landing.privacy":
    "Everything lives in a private GitHub repo you own — the app stores nothing.",

  "header.unsynced": "unsynced changes",
  "header.addRoutine": "add routine",
  "header.editLayout": "edit layout",
  "header.done": "done",
  "header.settings": "settings",
  "header.signOut": "sign out",

  "empty.fact": "the grid is empty",
  "empty.hint":
    "A routine runs a skill on a schedule and publishes one widget here.",
  "empty.cta": "Add your first routine",

  "offgrid.title": "not on the grid",

  "widget.stale": "stale",
  "widget.staleTitle": "overdue relative to its schedule",
  "widget.ran": "ran {ago}",
  "widget.never": "never ran",
  "widget.unreachable": "github unreachable — retries on next refresh",
  "widget.waiting": "waiting for its first run —",
  "widget.disabled": "routine disabled",
  "widget.moveLeft": "move left",
  "widget.moveRight": "move right",
  "widget.moveUp": "move up",
  "widget.moveDown": "move down",
  "widget.columns": "columns",
  "widget.rows": "rows",
  "widget.remove": "remove {name} from grid",

  "time.now": "just now",
  "time.minutes": "{n}m ago",
  "time.hours": "{n}h ago",
  "time.days": "{n}d ago",

  "dialog.title": "Add a routine",
  "dialog.description":
    "A skill from the catalog, run on a schedule, rendering one widget.",
  "dialog.skill": "Skill",
  "dialog.catalogEmpty1": "The catalog is empty — no skill has published a",
  "dialog.catalogEmpty2":
    "block yet. Add one to a skill in the shared repo and run",
  "dialog.name": "Name",
  "dialog.namePlaceholder": "Daily Plan",
  "dialog.slug": "Slug",
  "dialog.slugTaken": "already used by another routine",
  "dialog.size": "Widget size",
  "dialog.schedule": "Schedule",
  "dialog.suggested": "suggested — {cron}",
  "dialog.customCron": "custom cron…",
  "dialog.customCronLabel": "custom cron expression",
  "dialog.presetHourly": "hourly",
  "dialog.presetEvery4h": "every 4 hours",
  "dialog.presetDaily8": "daily at 8:00",
  "dialog.presetWeekdays9": "weekdays at 9:00",
  "dialog.presetWeeklyMon9": "weekly, Monday 9:00",
  "dialog.instructions": "Instructions",
  "dialog.instructionsHint": "(optional — passed to the skill on every run)",
  "dialog.instructionsPlaceholder":
    "Which projects matter, what to ignore, tone…",
  "dialog.cancel": "Cancel",
  "dialog.add": "Add to draft",

  "sync.title": "Sync changes",
  "sync.description":
    "Persist the draft to your data repo — it only exists in this browser until then.",
  "sync.prOpened": "Pull request opened",
  "sync.nothing1": "The draft matches what's on",
  "sync.nothing2": "— nothing to sync.",
  "sync.baseMoved": "Base moved",
  "sync.baseMovedBody":
    "{files} changed in the repo since this draft was made. Re-apply the draft onto the fresh base and re-review the diff.",
  "sync.and": " and ",
  "sync.reapply": "Re-apply on fresh base",
  "sync.asPr": "open a PR instead",
  "sync.discard": "Discard draft",
  "sync.commit": "Commit to main",
  "sync.openPr": "Open PR",
  "sync.syncing": "syncing…",

  "setup.title": "Create your dashboard repo",
  "setup.hi1": "Hi",
  "setup.hi2":
    "— Bulletin keeps everything it knows about you in one private GitHub repo:",
  // {branch} is replaced with a <code>-styled branch name at render time,
  // so each locale controls the article and word order around it.
  "setup.bulletMain":
    "{branch} holds config — which routines run, and the grid layout",
  "setup.bulletArtifacts": "an {branch} branch holds what they publish",
  "setup.bulletPrivate":
    "private: only you (and collaborators you invite) can read it",
  "setup.create": "Create repo",
  "setup.creating": "creating…",

  "settings.title": "settings",
  "settings.back": "back to the board",
  "settings.appearance": "appearance",
  "settings.mode": "mode",
  "settings.modeAuto": "auto",
  "settings.modeLight": "light",
  "settings.modeDark": "dark",
  "settings.modeHintSystem": "follows your OS — light by day, dark by night",
  "settings.modeHintLight": "always the light theme",
  "settings.modeHintDark": "always the dark theme",
  "settings.theme": "theme",
  "settings.themeHint": "one pick fills both the light and the dark slot",
  "settings.mix": "mix light & dark separately",
  "settings.mixLight": "light",
  "settings.mixDark": "dark",
  "settings.notApplied":
    "not what's showing right now — the mode is pinned to the other slot",
  "settings.language": "language",
  "settings.languageHint":
    "chrome only — widgets speak whatever their routine writes",
  "settings.saved":
    "appearance is saved on this device; language travels as a cookie",

  "error.title": "Error",
  "error.notFound": "The requested page could not be found.",
  "error.generic": "An unexpected error occurred.",
} as const

export type MessageKey = keyof typeof en
export type Messages = Record<MessageKey, string>
