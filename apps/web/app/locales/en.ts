/**
 * English — the source dictionary. Its keys define `MessageKey`; every
 * other locale must fill exactly this set (enforced by the type in
 * pt-br.ts). Keys are flat and dotted; `{name}` marks interpolation slots.
 * Voice per DESIGN.md: Sentence case for chrome; literal machine strings
 * (slugs, branch names, cron, shell commands) verbatim; git words plain.
 */
export const en = {
  "landing.headline": "Reports that update themselves.",
  "landing.tagline":
    "A dashboard of living widgets — daily and weekly plans, project reports, repo status, changelogs — each kept fresh by a routine that runs on a schedule.",
  "landing.signIn": "Sign in with GitHub",
  "landing.privacy":
    "Your data is yours — it lives in a private GitHub repo you own; the app stores nothing.",
  "landing.deviceLink": "Sign in with a device code instead",
  // Pager voice, deliberately lowercase mono next to a ▾ glyph — like the
  // pipeline tokens; the aria label speaks full chrome.
  "landing.more": "more",
  "landing.moreLabel": "Scroll to how it works",

  "landing.loop.title": "How a widget stays fresh",
  "landing.loop.cron":
    "A schedule fires, and the routine runs in the cloud or on your machine.",
  "landing.loop.skill":
    "Claude Code executes the routine: it follows your template or instructions and writes one self-contained HTML file.",
  "landing.loop.push":
    "Publishing is a git push. No upload, no CDN, and version history for free.",
  "landing.loop.widget": "The dashboard renders the file in a sandboxed frame.",
  "landing.loop.prereqs":
    "All it takes: a GitHub account and Claude Code — routines run in the cloud or on your machine.",

  "landing.data.title": "Your data is yours",
  "landing.data.repo":
    "One private repo holds everything — routines, layouts, published widgets. Privacy is GitHub's repo boundary.",
  "landing.data.stateless":
    "No database, no CDN — the app reads your repo and stores nothing anywhere else. Publishing is just a git push.",
  "landing.data.leave":
    "Leaving is deleting a repo. Nothing to export, nothing left behind.",

  "landing.features.title": "What's built in",
  "landing.features.templates.title": "Templates, or your own words",
  "landing.features.templates.body":
    "Start from a built-in template — daily plan, repo pulse — and fill in its settings, or describe the widget you want in plain words. A routine is a few lines of YAML in your repo.",
  "landing.features.hosts.title": "Cloud or local, scheduled or manual",
  "landing.features.hosts.body":
    "Run in Anthropic's cloud with the laptop closed, or on your machine next to local data.",
  "landing.features.fresh.title": "Freshness you can trust",
  "landing.features.fresh.body":
    "Every widget shows when it last ran, straight from commit history — and a stale one says so.",

  "landing.cta": "Glance instead of digging.",

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
  "nav.routines": "Routines",
  "nav.unsynced": "Unsynced changes",
  "nav.runInFlight": "Run in flight",
  "nav.stale": "Stale",
  "nav.fresh": "Up to date",
  "account.menu": "Account",
  "account.githubAccount": "GitHub account",

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

  "routines.title": "Routines",
  "routines.subtitle":
    "Every routine in {repo} — its state, schedule, and where it renders.",
  "routines.new": "New routine",
  "routines.colName": "Routine",
  "routines.colState": "State",
  "routines.colSchedule": "Schedule",
  "routines.colHost": "Host",
  "routines.colOwner": "Owner",
  "routines.colBoards": "On boards",
  "routines.colActions": "Actions",
  "routines.count": "{n} routines",
  "routines.manualDash": "Manual",
  "routines.stateDraft": "Draft",
  "routines.stateDisabled": "Disabled",
  "routines.stateUnreachable": "Unreachable",
  "routines.stateNeedsSetup": "Needs setup",
  "routines.stateNever": "Never ran",
  "routines.orphan": "orphan",
  "routines.rowMenu": "Options for {name}",
  "routines.runNow": "Run {name} now",
  "routines.edit": "Edit",
  "routines.addToBoard": "Add to board",
  "routines.noBoards": "No boards yet",
  "routines.placeSyncFirst": "Sync first to place it",
  "routines.openInClaude": "Open in claude.ai",
  "routines.enable": "Enable",
  "routines.disable": "Disable",
  "routines.delete": "Delete",
  "routines.emptyTitle": "No routines in this repo yet.",
  "routines.emptyHint":
    "A routine produces a widget — add one, then place it on a board.",

  // One routine's detail view (ADR-0033): its facts, then its run history —
  // the publish receipts on the artifacts branch. Voice: receipts and
  // commits are called what they are (git words plain, DESIGN.md).
  "runs.back": "All routines",
  "runs.heading": "Runs",
  "runs.subtitle":
    "Every run ends by publishing the artifact — one commit per run on the artifacts branch. This is that history.",
  // {claude} renders as a link to the routine on claude.ai.
  "runs.claudeNote":
    "Failed runs leave no receipt — sessions, logs, and failures live on {claude}.",
  "runs.colRan": "Ran",
  "runs.colGap": "After",
  "runs.colBy": "By",
  "runs.colReceipt": "Receipt",
  "runs.count": "{n} runs",
  "runs.capped": "last {n} runs",
  "runs.firstTag": "first run",
  "runs.lateTag": "late",
  "runs.empty": "No runs yet — nothing has published this widget.",
  "runs.unreachable":
    "GitHub unreachable — run history couldn't load. It retries on refresh.",
  "runs.loading": "Loading run history…",

  // Version browsing + compare (ADR-0038): a run's row opens the artifact as
  // it published, and two rows compare side by side. The raw text diff stays
  // on GitHub, where git already renders it.
  "runs.viewArtifact": "View this run's artifact",
  "runs.compare": "Compare",
  "runs.compareCancel": "Cancel",
  "runs.compareHint": "Pick two runs to compare.",
  "runs.compareSelected": "{n}/2 selected",
  "runs.compareOpen": "Compare runs",
  "runs.selectForCompare": "Select this run to compare",
  "runs.compareOlder": "older",
  "runs.compareNewer": "newer",
  "runs.textDiff": "Text diff on GitHub",
  "runs.versionLoading": "Loading this run's artifact…",
  "runs.versionError":
    "GitHub unreachable — this run's artifact couldn't load.",
  "runs.versionGone": "No artifact was published at this run.",

  "templates.title": "Templates",
  "templates.subtitle":
    "What the routine picker offers — {dir} in {repo}, plus the built-ins.",
  "templates.colTemplate": "Template",
  "templates.colDescription": "Description",
  "templates.colSource": "Source",
  "templates.colSchedule": "Suggested schedule",
  "templates.colUsedBy": "Used by",
  "templates.colActions": "Actions",
  "templates.count": "{n} templates",
  "templates.builtin": "built-in",
  "templates.shadows": "overrides built-in",
  "templates.unused": "unused",
  "templates.use": "New routine from {name}",

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
  "repo.access": "Access to {repo}",
  "repo.privateDetail": "Private — visible to collaborators only",
  "repo.publicDetail": "Public — anyone on GitHub can view",
  "repo.collaborators": "{n} people have access to {repo}",
  "repo.moreCollaborators": "+{n} more",
  "repo.manageAccess": "Manage access to {repo} on GitHub",
  "repo.viewOnGitHub": "View {repo} on GitHub",
  "repo.manageOnGitHub": "Manage access on GitHub",
  "repo.openOnGitHub": "View on GitHub",
  "repo.displayName": "Display name",
  "repo.saveName": "Save",
  "repo.rename": "Rename repo",
  "repo.renameTitle": "Rename repo",
  "repo.renameBody":
    "Shown as this repo's group in the sidebar. The repo on GitHub ({repo}) is untouched.",
  "repo.renameHint": "Leave empty to fall back to {name}.",
  "repo.renaming": "Saving…",
  "repo.renameFailed": "Couldn't save the name — try again.",

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
    "A grid of widgets — its layout file lives in the data repo you pick.",
  "newDash.repo": "Data repo",
  "newDash.slug": "Slug",
  "newDash.slugTaken": "Already used by another dashboard",
  "newDash.section": "Section",
  "newDash.sectionPlaceholder": "No section",
  "newDash.sectionHint":
    "Optional, but recommended — groups this board under a heading in the sidebar.",
  "newDash.create": "Create dashboard",
  "newDash.creating": "Creating…",
  "newDash.exists": "That dashboard already exists in the repo",

  "board.deleteDashboard": "Delete dashboard",
  "board.editDashboard": "Edit dashboard",
  "board.editTitle": "Edit dashboard",
  "board.editBody":
    "Files this board under a section in the sidebar. The slug ({slug}) and its URL don't change.",
  "board.sectionLabel": "Section",
  "board.sectionPlaceholder": "No section",
  "board.sectionHint":
    "Groups this dashboard under a heading in the sidebar. Leave empty for none.",
  "board.renameConfirm": "Save",
  "board.renaming": "Saving…",
  "board.renameConflict":
    "The dashboard changed in the repo just now — close and retry",
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
    "No API trigger for this routine — set one up with npx @devord/steward trigger {slug}",
  "widget.updateFailed": "The run request failed — try again",
  "widget.copyCommand": "Copy the terminal command that runs {name}",
  "widget.copied": "Command copied — run it from your Steward checkout",
  "widget.runLocalOpen": "Run {name} locally",
  "widget.runLocalTitle": "Run this routine locally",
  "widget.runLocalDescription":
    "{name} runs on your machine, not in the cloud — there's no API trigger to fire from here. Run it from a terminal:",
  "widget.runLocalCliLabel": "With the Steward CLI",
  "widget.runLocalPromptLabel": "Or ask Claude Code",
  "widget.unreachable": "GitHub unreachable — retries on next refresh",
  "widget.disabled": "Routine disabled",
  "widget.enable": "Enable",
  "widget.running": "Running",
  "widget.runningTitle": "Run in flight — open it in claude.ai",
  "widget.runningSince": "Running — started {ago}",
  "widget.draftHint": "In your draft — sync to commit it",
  "widget.needsTriggerHint":
    "Needs an API trigger before update works — from your Steward checkout:",
  "widget.awaitEnact": "Committed — enact it from your Steward checkout:",
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
  "time.nowShort": "now",
  "time.minutesShort": "{n}m",
  "time.hoursShort": "{n}h",
  "time.daysShort": "{n}d",

  // Bare durations (a run's gap to the previous one) — same vocabulary as
  // time.* without the "ago"; "now" is the under-a-minute case.
  "duration.now": "<1m",
  "duration.minutes": "{n}m",
  "duration.hours": "{n}h",
  "duration.days": "{n}d",

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
  "dialog.samplePreview": "Sample render — your routine's data will differ",
  "dialog.samplePreviewTitle": "{name} sample render",
  "dialog.name": "Name",
  "dialog.namePlaceholder": "Daily Plan",
  "dialog.slug": "Slug",
  "dialog.slugTaken": "Already used by another routine",
  "dialog.slugPending": "Set from the subject above",
  "dialog.slugDerivedHint": "Auto-set from the subject; fixed once created",
  "dialog.customize": "Customize",
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
    "Local routines run from your machine: scheduled ones enact via steward sync --apply (needs npm i -g @devord/steward), manual ones run with npx @devord/steward run <slug>",
  "dialog.manualCloudHint":
    "Manual cloud routines fire from the widget's update button via an API trigger — npx @devord/steward sync sets it up",
  "dialog.accountHint":
    "Owning Claude account: {account} — a cloud routine belongs to one account; re-sync from a different one to reassign it",
  "dialog.runnerHint":
    "After committing, run npx @devord/steward sync against the team repo — whoever runs it enacts the cloud resource under their Claude account",
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
    "Saved to the repo, but a routine only runs once it's enacted. From your Steward checkout:",
  "sync.done": "Done",
  "sync.asPr": "Open a PR instead",
  "sync.discard": "Discard draft",
  "sync.commit": "Commit to main",
  "sync.openPr": "Open PR",
  "sync.syncing": "Syncing…",

  "setup.title": "Create your dashboard repo",
  "setup.hi1": "Hi",
  "setup.hi2":
    "— Steward keeps everything it knows about you in one private GitHub repo:",
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
