/**
 * English — the source dictionary. Its keys define `MessageKey`; every
 * other locale must fill exactly this set (enforced by the type in
 * pt-br.ts). Keys are flat and dotted; `{name}` marks interpolation slots.
 * Voice per DESIGN.md: Sentence case for chrome; literal machine strings
 * (slugs, branch names, cron, shell commands) verbatim; git words plain.
 */
export const en = {
  "landing.tagline":
    "A dashboard of living widgets — each one an HTML report that a scheduled routine regenerates.",
  "landing.sub": "Reports that update themselves.",
  "landing.signIn": "Sign in with GitHub",
  "landing.privacy":
    "Everything lives in a private GitHub repo you own — the app stores nothing.",
  "landing.deviceLink": "Sign in with a device code instead",

  "device.title": "Sign in with a device code",
  "device.intro":
    "For preview builds and anywhere the GitHub redirect can't reach — you'll get a short code to enter on github.com.",
  "device.start": "Get a code",
  "device.starting": "Getting a code…",
  "device.enterCode": "Enter this code on GitHub:",
  "device.copy": "Copy code",
  "device.copied": "Copied",
  "device.openLink": "Open the GitHub device page",
  "device.waiting": "Waiting for you to authorize on GitHub…",
  "device.newCode": "Get a new code",
  "device.expired": "That code expired before it was authorized.",
  "device.denied": "Authorization was denied on GitHub.",
  "device.error": "Something went wrong reaching GitHub. Try again.",

  "header.unsynced": "Unsynced changes",
  "header.addRoutine": "Add routine",
  "header.editLayout": "Edit",
  "header.done": "Done",
  "header.settings": "Settings",
  "header.signOut": "Sign out",

  "nav.boards": "Boards",
  "nav.openMenu": "Open navigation",
  "nav.collapse": "Collapse sidebar",
  "nav.expand": "Expand sidebar",
  "nav.resize": "Resize sidebar",
  "account.menu": "Account",
  "account.githubAccount": "GitHub account",
  "account.viewRepo": "View data repo",

  "empty.fact": "The grid is empty",
  "empty.hint":
    "A routine publishes one widget here, on a schedule or on demand.",
  "empty.cta": "Add your first routine",

  "offgrid.title": "Not on the grid",
  "offgrid.hint":
    "In this repo's shared {file} — place one, or delete it from the repo.",
  "offgrid.delete": "Delete {name} from the repo",
  "offgrid.edit": "Edit {name}",
  "offgrid.viewHint": "{n} not on this board — Edit to place",

  "routine.deleteTitle": "Delete {name}?",
  "routine.deleteBody":
    "Removes the routine from routines.yaml when you next sync. Routines are shared across every dashboard in this repo, so it disappears from all of them.",
  "routine.deleteConfirm": "Delete routine",
  "routine.edit": "Edit {name}",
  "routine.enable": "Enable {name}",
  "routine.disable": "Disable {name}",

  "grid.columnsLabel": "Columns",
  "grid.width": "Width",
  "grid.widthFixed": "Fixed",
  "grid.widthWide": "Wide",
  "grid.density": "Density",
  "grid.densityCompact": "Compact",
  "grid.densityCozy": "Cozy",
  "grid.densityRoomy": "Roomy",
  // Edit-mode keymap hint: each *Key renders as a <kbd> chip before its verb.
  "grid.moveKey": "drag",
  "grid.moveLabel": "move",
  "grid.resizeKey": "corner",
  "grid.resizeLabel": "resize",
  "grid.removeKey": "del",
  "grid.removeLabel": "remove",

  "switcher.label": "Dashboard",
  "switcher.personal": "Personal",
  "switcher.new": "New dashboard",
  "switcher.newHere": "Create the first dashboard",
  "switcher.addRepo": "Add data repo",
  "switcher.incomplete": "Some repos may be missing — GitHub search flaked",

  "repo.private": "Private repo",
  "repo.public": "Public repo",
  "repo.collaborators": "{n} people have access to {repo}",
  "repo.manageAccess": "Manage access to {repo} on GitHub",
  "repo.viewOnGitHub": "View {repo} on GitHub",

  "addRepo.title": "Add a data repo",
  "addRepo.description":
    "Each data repo holds its own routines, dashboards, and templates. Whoever can read the repo on GitHub sees its boards here.",
  "addRepo.mode": "How",
  "addRepo.modeCreate": "Create new",
  "addRepo.modeCreateHint": "A private repo from the template",
  "addRepo.modeRegister": "Register existing",
  "addRepo.modeRegisterHint": "Tag a data repo you already have",
  "addRepo.owner": "Owner",
  "addRepo.name": "Name",
  "addRepo.createHint":
    "Pick an org to share with its people — repo access is the only access control.",
  "addRepo.existing": "Repository",
  "addRepo.registerHint":
    "Needs data/routines.yaml on main, and push access to tag it.",
  "addRepo.alreadyKnown": "Already in your rail",
  "addRepo.create": "Create repo",
  "addRepo.register": "Register",
  "addRepo.working": "Working…",
  "addRepo.errDenied":
    "GitHub wouldn't allow it with this account — org permissions or OAuth app approval may be missing.",
  "addRepo.errTemplate":
    "The data-repo template couldn't be found — check the deployment's template setting.",
  "addRepo.errExists": "A repo with that name already exists there.",
  "addRepo.errMissing": "No such repo — or this account can't see it.",
  "addRepo.errNotDataRepo":
    "That repo has no data/routines.yaml — create one from the template instead, or add the file first.",

  "newDash.title": "New dashboard",
  "newDash.description":
    "A named grid of widgets — its layout file lives in the data repo you pick.",
  "newDash.repo": "Data repo",
  "newDash.name": "Name",
  "newDash.namePlaceholder": "Team Ops",
  "newDash.slug": "Slug",
  "newDash.slugTaken": "Already used by another dashboard",
  "newDash.create": "Create dashboard",
  "newDash.creating": "Creating…",
  "newDash.exists": "That dashboard already exists in the repo",

  "board.deleteDashboard": "Delete dashboard",
  "board.menu": "Dashboard options",
  "board.deleteTitle": "Delete this dashboard?",
  "board.deleteBody":
    "Removes {path} from {repo}. Routines keep running — only this layout goes away.",
  "board.deleteConfirm": "Delete",
  "board.deleting": "Deleting…",
  "board.deleteConflict":
    "The dashboard changed in the repo just now — close and retry",
  "board.widgetsLoading": "Loading widgets…",
  "board.widgetsLoaded": "Widgets loaded",
  "board.widgetsUnreachable": "Widgets couldn't load — retrying shortly",

  "widget.stale": "Stale",
  "widget.staleTitle": "Overdue relative to its schedule",
  "widget.ran": "Ran {ago}",
  "widget.never": "Never ran",
  "widget.manual": "Manual",
  "widget.manualTitle": "Runs on demand — no schedule",
  "widget.update": "Update {name} now",
  "widget.updateShort": "Update",
  "widget.updateRequested": "Run requested — refresh in a minute",
  "widget.updateNoTrigger":
    "No API trigger for this routine — set one up with pnpm routine:trigger {slug}",
  "widget.updateFailed": "The run request failed — try again",
  "widget.copyCommand": "Copy the terminal command that runs {name}",
  "widget.copied": "Command copied — run it from your Bulletin checkout",
  "widget.unreachable": "GitHub unreachable — retries on next refresh",
  "widget.disabled": "Routine disabled",
  "widget.enable": "Enable",
  "widget.running": "Running",
  "widget.runningSince": "Running — started {ago}",
  "widget.draftHint": "In your draft — sync to commit it",
  "widget.needsTriggerHint":
    "Needs an API trigger before update works — from your Bulletin checkout:",
  "widget.awaitEnact": "Committed — enact it from your Bulletin checkout:",
  "widget.awaitLocalManual": "Runs on your machine — run it when you need it:",
  "widget.readyManual": "Ready — press update to run it",
  "widget.runNow": "Run now",
  "widget.runFirst": "Run first update",
  "widget.orWaitSchedule": "or wait for its schedule ({cron})",
  "widget.firstRunSchedule": "First run lands on its schedule ({cron})",
  "widget.runnerNote": "{runner} must run this — the cloud resource is theirs",
  "widget.copyCmd": "Copy command",
  "widget.moveLeft": "Move left",
  "widget.moveRight": "Move right",
  "widget.moveUp": "Move up",
  "widget.moveDown": "Move down",
  "widget.columns": "Columns",
  "widget.rows": "Rows",
  "widget.remove": "Remove {name} from grid",
  "widget.expand": "Expand {name} to full screen",
  "widget.expandShort": "Expand",
  "widget.collapse": "Close",

  "time.now": "just now",
  "time.minutes": "{n}m ago",
  "time.hours": "{n}h ago",
  "time.days": "{n}d ago",

  "dialog.title": "Add a routine",
  "dialog.description":
    "Describe what the widget shows; a routine keeps it fresh on a schedule or on demand.",
  "dialog.editTitle": "Edit routine",
  "dialog.editDescription":
    "Change how this routine runs. Its slug is fixed — delete and re-add to rename it. Placement and size are set on the grid.",
  "dialog.prompt": "What should this widget show?",
  "dialog.promptPlaceholder": "Open PRs across our repos, grouped by reviewer…",
  "dialog.template": "Template",
  "dialog.customCard": "Describe it yourself — your description is the brief",
  "dialog.sourceRepo": "This repo",
  "dialog.sourceBuiltin": "Built-in",
  "dialog.name": "Name",
  "dialog.namePlaceholder": "Daily Plan",
  "dialog.slug": "Slug",
  "dialog.slugTaken": "Already used by another routine",
  "dialog.schedule": "Schedule",
  "dialog.suggested": "Suggested — {cron}",
  "dialog.customCron": "Custom cron…",
  "dialog.customCronLabel": "Custom cron expression",
  "dialog.presetHourly": "Hourly",
  "dialog.presetEvery4h": "Every 4 hours",
  "dialog.presetDaily8": "Daily at 8:00",
  "dialog.presetWeekdays9": "Weekdays at 9:00",
  "dialog.presetWeeklyMon9": "Weekly, Monday 9:00",
  "dialog.manual": "Manual — run on demand",
  "dialog.host": "Runs on",
  "dialog.hostCloud": "Cloud — a Claude routine",
  "dialog.hostLocal": "Local — your machine",
  "dialog.hostCloudShort": "Cloud",
  "dialog.hostLocalShort": "Local",
  "dialog.hostLocalHint":
    "Local routines run from your machine: scheduled ones enact via pnpm routines:sync, manual ones run with pnpm routine <slug>",
  "dialog.manualCloudHint":
    "Manual cloud routines fire from the widget's update button via an API trigger — pnpm routines:sync sets it up",
  "dialog.runnerHint":
    "The cloud resource runs on {login}'s Claude account — after committing, run pnpm routines:sync against the team repo",
  "dialog.cancel": "Cancel",
  "dialog.add": "Add to draft",
  "dialog.save": "Save changes",
  "dialog.next": "Next",
  "dialog.back": "Back",
  "dialog.stepLabel": "Step {n} of 2",
  "dialog.customHint": "runs your description as written",
  "dialog.promote": "Save as template",
  "dialog.promoteHint":
    "Copy and run from your data repo checkout — Claude generalizes this routine into templates/routines/ and points it there",
  "dialog.required": "Required",
  "dialog.advanced": "Advanced",
  "dialog.extraRepos": "Extra source repos",
  "dialog.extraReposHint":
    "Repos the cloud run can read beyond the contract and data repos — repos a template watches are attached automatically",
  "dialog.connectors": "Connectors",
  "dialog.connectorsHint":
    "MCP connectors the run may use, by account name — it gets none unless listed",
  "dialog.repoEmpty": "Type owner/repo — suggestions come from your repos",
  "dialog.connectorEmpty": "Type a connector's account name",
  "dialog.addToken": 'Add "{value}"',
  "dialog.removeToken": "Remove {value}",

  "sync.title": "Sync changes",
  "sync.description":
    "Persist the draft to your data repo — it only exists in this browser until then.",
  "sync.prOpened": "Pull request opened",
  "sync.nothing1": "The draft matches what's on",
  "sync.nothing2": "— nothing to sync.",
  "sync.baseMoved": "Base moved",
  "sync.baseMovedBody":
    "{files} changed in the repo since this draft was made. Keep your version to overwrite the repo's copy, or take the server's and discard your draft.",
  "sync.and": " and ",
  "sync.keepMine": "Keep my version",
  "sync.takeServer": "Take server version",
  "sync.nextSteps": "Committed — next, enact your new routines",
  "sync.nextStepsBody":
    "Saved to the repo, but a routine only runs once it's enacted. From your Bulletin checkout:",
  "sync.done": "Done",
  "sync.asPr": "Open a PR instead",
  "sync.discard": "Discard draft",
  "sync.commit": "Commit to main",
  "sync.openPr": "Open PR",
  "sync.syncing": "Syncing…",

  "setup.title": "Create your dashboard repo",
  "setup.hi1": "Hi",
  "setup.hi2":
    "— Bulletin keeps everything it knows about you in one private GitHub repo:",
  // {branch} is replaced with a <code>-styled branch name at render time,
  // so each locale controls the article and word order around it.
  "setup.bulletMain":
    "{branch} holds config — which routines run, and the grid layout",
  "setup.bulletArtifacts": "An {branch} branch holds what they publish",
  "setup.bulletPrivate":
    "Private: only you (and collaborators you invite) can read it",
  "setup.create": "Create repo",
  "setup.creating": "Creating…",
  "setup.wrongAccount":
    "Sure this repo already exists? This check runs live each time, so it's not stale — you're most likely signed in as a different GitHub account than the one that owns it. Check the login above and sign out to switch.",

  "settings.title": "Settings",
  "settings.back": "Back to the board",
  "settings.appearance": "Appearance",
  "settings.mode": "Mode",
  "settings.modeAuto": "Auto",
  "settings.modeLight": "Light",
  "settings.modeDark": "Dark",
  "settings.modeHintSystem": "Follows your OS — light by day, dark by night",
  "settings.modeHintLight": "Always the light theme",
  "settings.modeHintDark": "Always the dark theme",
  "settings.theme": "Theme",
  "settings.themeHint": "One pick fills both the light and the dark slot",
  "settings.mix": "Mix light & dark separately",
  "settings.mixLight": "Light",
  "settings.mixDark": "Dark",
  "settings.notApplied":
    "Not what's showing right now — the mode is pinned to the other slot",
  "settings.language": "Language",
  "settings.languageHint":
    "Chrome only — widgets speak whatever their routine writes",
  "settings.saved":
    "Appearance is saved on this device; language travels as a cookie",

  "error.title": "Error",
  "error.notFound": "The requested page could not be found.",
  "error.generic": "An unexpected error occurred.",
} as const

export type MessageKey = keyof typeof en
export type Messages = Record<MessageKey, string>
