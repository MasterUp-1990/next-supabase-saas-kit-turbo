---
name: verify-app
description: Prove a change works in the running app, the way a user would hit it, with captured evidence. Use after any user-visible change (UI, routes, server actions, auth, billing, emails, RLS a user can feel) and before reporting it done. Typecheck, lint, and unit tests are not proof that a feature works.
---

# Verify in the running app

Drive the real app through the path a user takes, then check the resulting state, not just the screen. This does not replace the e2e suite: it is a one-off proof for the change in front of you.

## 1. Doctor: is this the right instance?

Other projects on this machine often use the same ports. A server that answers can belong to another repo, and then every check below passes against the wrong app. Run all three checks before driving anything:

```bash
docker ps --format '{{.Names}}' | grep supabase_db_   # must end in this repo's project_id
grep '^project_id' apps/web/supabase/config.toml
lsof -nP -iTCP:3000 -sTCP:LISTEN                      # then: lsof -a -p <pid> -d cwd
```

- The Supabase containers must be named after this repo's `project_id`. A stack from another project holds ports `54321`–`54327`: ask the user before stopping it, because it may be in use.
- The `:3000` listener's working directory must be this repo. If another repo's server holds the port, ask the user.
- `curl -s localhost:3000/api/healthcheck` must return `{"services":{"database":true}}`. Read the body: the route answers 200 even when the database check fails. It only proves the app is up, not that it is this app, so it comes after the two checks above.

Run the doctor again after any drive that fails in a surprising way.

## 2. Launch what is missing

```bash
pnpm supabase:web:start   # no-op if this repo's stack is already running
pnpm dev                  # web on http://localhost:3000
```

Ready means `/api/healthcheck` returns `{"services":{"database":true}}` and `/auth/sign-in` renders. Reuse a running instance of this repo. Never start a second one. Remember what you started, because cleanup stops only that.

## 3. Pick who acts

Seeded users (password `testingpassword`):

| User | Role |
| --- | --- |
| `test@makerkit.dev` | owner of team `makerkit` |
| `owner@makerkit.dev` | owner of team `makerkit` |
| `member@makerkit.dev` | member of team `makerkit` |
| `custom@makerkit.dev` | `custom-role` on team `makerkit` |
| `super-admin@makerkit.dev` | super admin, requires MFA |

The e2e suite depends on these users. Anything that mutates or deletes data (settings, deletion, invitations, billing) runs as a fresh user from `AuthPageObject.createRandomEmail()` or `bootstrapUser()` in `apps/e2e/tests/authentication/auth.po.ts`. For tenant isolation, act as one user and confirm another account's data stays invisible.

## 4. Drive it

Use a browser tool if one is available. Otherwise write a throwaway Playwright spec. Either way, follow the selector rules in `apps/e2e/AGENTS.md`: `data-test` attributes, scoped to `:visible`, and treat a dev-overlay error as a broken build.

The throwaway spec goes in `apps/e2e/tests/verify/` (gitignored) and reuses the existing page objects: `AuthPageObject.loginAsUser` and `loginAsSuperAdmin` (which uses `MFA_KEY`), and `Mailbox` in `apps/e2e/tests/utils/mailbox.ts`. Run it alone:

```bash
pnpm --filter web-e2e exec playwright test tests/verify/<name>.spec.ts \
  --project=chromium --workers=1 --retries=0 --reporter=line
```

The first run also runs the `setup` project, which logs in the seeded users and writes `apps/e2e/.auth/*.json`. Later runs can add `--no-deps` and load a saved session with `test.use({ storageState: AUTH_STATES.TEST_USER })` from `apps/e2e/tests/utils/auth-state.ts`.

If Playwright fails with `Executable doesn't exist`, install its browser: `pnpm --filter web-e2e exec playwright install chromium`.

The first drive after starting the dev server can fail while pages compile for the first time. Run the doctor, rerun once, and if it passes, report the first failure as inconclusive rather than dropping it.

## 5. Capture evidence

Create `apps/e2e/verify-evidence/` before writing files into it: screenshots create the folder, `fs.writeFileSync` does not.

A proof shows the action and the state it produced:

- **Screen.** `page.screenshot({ path: 'verify-evidence/<step>.png' })` after the action, not only at the end. Not `test-results/`: Playwright empties it at the start of every run.
- **Database.** `pnpm --filter web supabase db query --local "select ..."` for the rows the action should have written, updated, or left alone.
- **Email.** Mailpit at `http://127.0.0.1:54324` (`Mailbox` wraps its API). Assert the recipient, the subject, and the link or code.
- **Server.** The `pnpm dev` output for errors logged during the action.

Exercise the real user path, not an internal setter or a direct database write that skips the server action.

## 6. Clean up

- Delete the throwaway spec. A leftover spec runs in the next local `pnpm test`.
- Stop only the processes you started.
- Keep the evidence in `apps/e2e/verify-evidence/`. It is gitignored.
- `pnpm supabase:web:reset` wipes all local data. Ask the user first.

## Report

Give each claim one verdict: **verified** (with the evidence path or query output), **not verified** (what failed), or **inconclusive** (what blocked the check, such as another project's stack holding the ports). Inconclusive is not a pass.
