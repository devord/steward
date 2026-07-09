# Auth: GitHub OAuth app behind React Router SSR, cookie session

Users sign in with GitHub, and every read/write the app performs uses their
token (ADR-0001). GitHub's OAuth code→token exchange requires a client
secret, and its device-flow endpoints send no CORS headers — so a pure SPA is
out. We run the app in **React Router framework mode with SSR** (deployed on
Vercel) and keep auth in three resource routes: `/auth/login`,
`/auth/callback`, `/auth/logout`.

- **Session** = encrypted httpOnly cookie holding the GitHub access token
  (`createCookieSessionStorage`) — no session store, consistent with no-DB.
- **Scopes**: `repo` (contents read/write + PRs on the private data repo)
  and `read:user`.
- **Token stays server-side**: GitHub API calls go through loaders/actions,
  so the token never reaches the browser.

## Configuration

| Env var                                     | Meaning                                         |
| ------------------------------------------- | ----------------------------------------------- |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | the OAuth app                                   |
| `SESSION_SECRET`                            | cookie encryption                               |
| `BULLETIN_SHARED_REPO`                      | `owner/name` of this repo (catalog + contracts) |
| `BULLETIN_DATA_REPO_TEMPLATE`               | `owner/name` of the data-repo template          |
| `BULLETIN_DATA_REPO_PREFIX`                 | default `bulletin-data-`                        |

The data repo resolves at sign-in as `<login>/<prefix><login>`; if missing,
the app offers the first-run "create your dashboard repo" wizard
(generate-from-template API). A per-user override can live in the session
cookie without breaking the no-DB rule.

## Consequences

- A fine-grained GitHub App (instead of a classic OAuth app) would scope
  tighter than `repo`; revisit when the user base outgrows the team.
- Anything that later runs without a user present (e.g. "Run now" from the
  server) needs its own credential story — out of scope for the app itself;
  routines authenticate on their own host (ADR-0005).
