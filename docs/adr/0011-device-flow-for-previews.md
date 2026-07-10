# Auth: device flow as a second sign-in path, for previews and CLIs

The redirect flow (ADR-0004) is bound to a single callback URL: a classic
GitHub OAuth app accepts exactly one authorization callback, and GitHub
matches the `redirect_uri` host against it exactly — no wildcards. Every
Vercel preview deploy gets its own subdomain
(`bulletin-git-<branch>-<team>.vercel.app`), so no preview can ever complete
the redirect dance. Reviewers couldn't sign in to test a branch.

GitHub's **device flow** uses no `redirect_uri` at all, so it works on any
host with zero per-deploy GitHub config. We add it as a **second** sign-in
path alongside the redirect flow, not a replacement — the redirect flow stays
the default on production (one click, no code to type).

- Two resource actions on one route, `/auth/device`:
  - `intent=start` → `POST github.com/login/device/code`, stash
    `{ code, userCode, verificationUri, interval, expiresAt }` in the session
    cookie, then post/redirect/get so a reload doesn't mint a second code.
  - `intent=poll` → `POST github.com/login/oauth/access_token` with
    `grant_type=urn:ietf:params:oauth:grant-type:device_code`; on success it
    writes `token` + `login` into the session exactly like `auth.callback`.
- The page auto-polls with a fetcher, honouring the returned `interval` and
  widening it on `slow_down`. Only the human-facing `user_code` is rendered.
- The transient `device_code` rides in the same signed httpOnly session cookie
  as `oauthState` — and as the GitHub **access token** the cookie already
  holds per ADR-0004. It is strictly less sensitive than that token (single
  user, ~15-minute life, `unset` the instant the token arrives), so it doesn't
  justify a server-side store that would break the no-DB / no-session-store
  posture ADR-0004 sets.
- Requires **Device Flow enabled** on the OAuth app (a one-time checkbox).
- These endpoints send no CORS headers and sit on github.com, not
  api.github.com — so they're driven server-side, outside the authed `gh()`
  client (`lib/github-device.server.ts`), consistent with ADR-0004's reason a
  pure SPA is out.

The landing page carries a small secondary "sign in with a device code" link
so preview reviewers can reach it without a production round-trip.

## Consequences

- Preview and CLI-style sign-in now work with no new callback URLs and no
  proxy. UX cost: the tester types an 8-character code on github.com.
- Same token, same scopes (`repo read:user`), same cookie session as the
  redirect flow — nothing downstream changes.
- Rejected alternatives: a prod-domain **callback proxy** (more moving parts,
  origin-allowlist footgun); a **fixed staging domain** with its own OAuth app
  (only one branch testable, not arbitrary previews).
