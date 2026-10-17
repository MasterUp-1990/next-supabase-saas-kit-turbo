---
name: rls-review
description: Deep adversarial review of Row-Level Security. Statically audits every RLS policy, grant, SECURITY DEFINER function, view, and MFA/super-admin restriction for tenant-isolation holes, then PROVES the holes (or their absence) with runnable pgTAP tests that attack across tenants as real users. Use when asked to "review RLS", "audit tenant isolation", "check row-level security", "can users see other accounts' data", or after any schema/migration change that touches policies, grants, or security-definer functions. Invoke with /rls-review.
---

# Deep Adversarial RLS Review

You are a hostile tenant. Your job is to **escape your own account** — read, write, or delete another tenant's rows — and to keep trying until you either succeed or have exhausted every class of attack. You do not validate the schema; you try to break it, and you **prove each conclusion with a test that runs**.

**The one principle to preserve: static reading is a hypothesis, a passing pgTAP attack is a proof.** A policy that *looks* safe is not safe until a cross-tenant probe run as the attacking user fails to reach the data. Never sign off on isolation you have only read.

This repo is multi-tenant (`AGENTS.md`): personal accounts (`auth.users.id = accounts.id`) and team accounts (members + roles + permissions), everything linked by `account_id`. RLS is the only access-control layer for the standard client — there are no manual auth checks. A single missing `WITH CHECK` or a table-level `UPDATE` grant is a full cross-tenant breach.

---

## Stage 0 — Scope

Decide what you are reviewing:

- **Diff mode (default).** Changed policies/grants/functions and their blast radius.
  ```bash
  git diff HEAD -- 'apps/web/supabase/**'
  git status --short -- 'apps/web/supabase/**'
  ```
  If nothing is uncommitted, use the last commit (`git show HEAD -- 'apps/web/supabase/**'`).
- **Full-audit mode** (asked to audit the whole schema, or a new table lands): every file in `apps/web/supabase/schemas/`.

Announce which mode and which tables/policies are in scope before proceeding.

---

## Stage 1 — Build the isolation inventory

For every table in scope, extract the ground truth. Read the schema files in `apps/web/supabase/schemas/` (numbered by dependency). Record, per table:

| Fact | Where to look | Why it matters |
|---|---|---|
| RLS enabled? | `alter table ... enable row level security` | No RLS = every authenticated user reads everything. |
| Grants to `authenticated` | `grant ... to authenticated` | Table-level `UPDATE` = re-parenting attack (see Stage 2 #2). |
| Grants to `anon` / `public` | any `grant ... to anon`, policies `to public` | Unauthenticated leak. |
| Policies + their `for` / `to` / `using` / `with check` | `create policy` | The actual predicate — attack it. |
| PERMISSIVE vs RESTRICTIVE | `as restrictive` | MFA/tenant gates MUST be restrictive (AND), not permissive (OR). |
| SECURITY DEFINER functions | `security definer` | Bypass RLS; must validate + pin `search_path`. |
| Views over RLS tables | `create ... view` | Must be `security_invoker = true` or they run as owner and bypass RLS. |

Known helper functions (do NOT re-audit their internals unless they changed — trust but note): `has_role_on_account`, `has_permission`, `is_account_owner`, `has_active_subscription`, `is_team_member`, `can_action_account_member`, `is_super_admin`, `is_aal2`, `is_mfa_compliant`, `is_set`. If the diff changes one of these, it is in scope and every policy that calls it is downstream-affected.

---

## Stage 2 — Static adversarial audit (the attack catalog)

Walk every in-scope object against this catalog. Each item is an attack, not a style note. For every hit, write down the concrete exploit (which user, which statement, which row) — you will turn the plausible ones into pgTAP in Stage 3.

### A. Table exposure
1. **RLS not enabled.** Table has `grant ... to authenticated` but no `enable row level security`. Total exposure. Also check RLS is not silently disabled by the table owner bypass — for tables the app writes to via `service_role`, that's expected; for `authenticated` reads it is not.
2. **Table-level `UPDATE` grant to `authenticated`** — the re-parenting breach. With `grant update on table X to authenticated`, a user can `UPDATE X SET account_id = '<other tenant>'` and move a row into (or steal it from) another account; `WITH CHECK` alone does not reliably stop it. Per `apps/web/supabase/AGENTS.md`, `UPDATE` must be **column-scoped** (`grant update (col1, col2) ...`) excluding `id`, `account_id`, and any ownership FK. Flag every table-level UPDATE grant as a FAIL.
3. **Grants to `anon` or policies scoped `to public`** where the data is tenant-owned. `to public` includes `anon`. Personal/team data must be `to authenticated` (or narrower).

### B. Policy predicate holes
4. **Missing `WITH CHECK` on write paths.** `for insert` and `for update` need `with check` to constrain the *new* row. A `for update ... using (has_role_on_account(account_id))` with no `with check` lets a user edit their row and set `account_id` to a foreign account on the way out. `for all` inherits `using` as the default `with check` — acceptable, but verify the `using` predicate is also correct for writes.
5. **`INSERT` with an unconstrained `account_id`.** The `with check` must tie the new row to an account the user controls (`has_role_on_account(account_id)` / `= (select auth.uid())`), not just `true` or a self-referential check that the client supplies.
6. **`using (true)` / overly broad predicates.** Legitimate only for genuinely global reference tables (e.g. `roles_read`, public `config`). For anything with an `account_id`, `using (true)` is a read breach. Confirm each `true` is a reference table, not tenant data.
7. **Permission/role checks on the wrong `account_id`.** The predicate must gate on the row's own `account_id`, not a caller-supplied or unrelated column. Watch for **argument/column shadowing** — helper functions here disambiguate (`has_role_on_account.account_id`); a policy that passes the wrong column silently checks the wrong account.
8. **Read policies that leak existence/enumeration** — e.g. returning other tenants' rows filtered only in the app layer.

### C. RESTRICTIVE / defense-in-depth layers
9. **MFA gate must be RESTRICTIVE.** The `restrict_mfa_*` policies (`13-mfa.sql`) are `as restrictive` so they AND with the permissive policies. A new sensitive table added without a restrictive MFA policy, **or an MFA policy written as permissive**, defeats the whole MFA-required guarantee (a permissive policy ORs in access). If the diff adds a table that should be MFA-gated, its absence from `13-mfa.sql` is a finding.
10. **Super-admin policies** (`14-super-admin.sql`) rely on `is_super_admin()` (which requires AAL2). New tenant tables that should be admin-visible need a matching `super_admins_access_*` policy; ones that should NOT must not accidentally inherit one.

### D. SECURITY DEFINER functions (RLS bypass surface)
11. **Missing `set search_path = ''`.** A definer function without a pinned empty search_path is hijackable via a caller-controlled schema. Every definer function here sets it — a new one that doesn't is a FAIL.
12. **No permission check before privileged work.** Definer functions run as owner and bypass RLS. They must validate (`is_account_owner`, `has_permission`, explicit `raise exception`) *before* touching data. A definer function granted to `authenticated` that reads/writes by a caller-supplied `account_id` without a membership check is a cross-tenant RPC hole.
13. **Over-broad `grant execute`.** Should the function be callable by `authenticated`, or only `service_role`? A privileged mutation granted to `authenticated` is an attack surface.
14. **`auth.uid()` inside definer functions** still resolves to the *caller* — good — but verify the function doesn't accept a `user_id` param that it trusts instead of deriving identity from `auth.uid()`.

### E. Views & performance-correctness
15. **Views without `security_invoker = true`.** A view over an RLS table defaults (pre-PG15 behavior / when not set) to running with the *view owner's* privileges, bypassing the querying user's RLS entirely. Both views in `15-account-views.sql` set `(security_invoker = true)` — any new view over tenant data must too.
16. **`auth.uid()` not wrapped as `(select auth.uid())`.** Beyond performance (per-row re-eval), the wrapped form is the codebase convention; unwrapped calls in new policies are a smell worth flagging (correctness is unaffected but consistency/perf is).

### F. Storage
17. **`storage.objects` policies** (`16-storage.sql`) must scope by `bucket_id` AND ownership (`kit.get_storage_filename_as_uuid(name)` → account). A policy missing the `bucket_id` clause leaks across buckets; one missing the ownership clause leaks across tenants within a bucket.

---

## Stage 3 — Prove it with pgTAP (the deep part)

**This is what separates this skill from a read-through.** For every plausible finding from Stage 2 — and for every isolation guarantee you want to *confirm* — write a pgTAP test that performs the attack as the attacking user and asserts it fails. Tests live in `apps/web/supabase/tests/database/*.test.sql`.

Model them on the existing suite (e.g. `invitations.test.sql`, `memberships.test.sql`, `team-accounts.test.sql`). Use the makerkit/pgTAP helpers already in `00000-makerkit-helpers.sql`:

- `tests.create_supabase_user('handle', 'email')` — create isolated test users (don't rely on seeded users; e2e mutates them).
- `set local role service_role;` then `public.create_team_account('Name', tests.get_supabase_uid('handle'), 'slug');` — create a team account owned by a user (do NOT authenticate first, or the new-account trigger double-creates the owner membership).
- `makerkit.authenticate_as('handle')` — become that user (sets JWT + AAL1). `makerkit.set_session_aal('aal2')` / `makerkit.set_mfa_factor()` to test MFA gates. `makerkit.set_super_admin()` for admin paths.
- `tests.get_supabase_uid('handle')`, `makerkit.get_account_id_by_slug('slug')` — resolve ids.
- Assertions: `results_eq`, `is_empty`, `throws_ok`, `throws_like`, `lives_ok`, `ok`. Wrap the file in `begin; select no_plan(); ... select * from finish(); rollback;`.

**The two-tenant attack template** — the backbone of an isolation proof:

```sql
begin;
select no_plan();

select tests.create_supabase_user('attacker', 'attacker@test.com');
select tests.create_supabase_user('victim',   'victim@test.com');

set local role service_role;
select public.create_team_account('Victim Co', tests.get_supabase_uid('victim'), 'victim-co');
set local role postgres;

-- seed a victim-owned row in the table under review (as service_role or the victim)
-- insert into public.<table> (account_id, ...) values (makerkit.get_account_id_by_slug('victim-co'), ...);

-- become the attacker: a valid user with NO membership in victim-co
select makerkit.authenticate_as('attacker');

-- READ isolation: attacker sees zero victim rows
select is_empty(
  $$ select 1 from public.<table>
     where account_id = makerkit.get_account_id_by_slug('victim-co') $$,
  'attacker cannot read victim rows'
);

-- WRITE isolation: attacker cannot re-parent / insert into victim
select throws_ok(
  $$ update public.<table> set account_id = makerkit.get_account_id_by_slug('victim-co')
     where account_id = (select auth.uid()) $$,
  null, null,
  'attacker cannot re-parent a row into victim account'
);

-- DELETE isolation: attacker cannot delete victim rows (0 rows affected is also a pass — assert count)
-- INSERT isolation: with-check rejects a foreign account_id

select * from finish();
rollback;
```

For each attack class you flagged, instantiate this against the specific table/column/predicate. Cover, at minimum: **SELECT, INSERT (with-check), UPDATE (including the re-parenting `SET account_id`), DELETE**, and where relevant **the MFA-restrictive gate** (authenticate at AAL1 and assert the sensitive read is empty; then AAL2 + factor and assert it succeeds) and **super-admin** paths.

Run them:

```bash
pnpm --filter web supabase:test    # supabase db test — runs all *.test.sql
```

- A test that **fails to reject** a cross-tenant action = a **confirmed breach** (highest severity).
- A test that passes = isolation proven for that vector. Say so explicitly; don't just assert it.
- If Supabase isn't running: `pnpm supabase:web:start` (and `pnpm supabase:web:reset` to apply pending schema). If you genuinely cannot run the DB, say the finding is **static-only / unverified** — never imply a proof you didn't run.

Keep throwaway probe tests in the scratchpad; land only the tests that document a real guarantee or regression alongside the existing suite (and follow the repo's schema→migration workflow if the fix is yours to write).

---

## Stage 4 — Adversarial redundancy (refute your own findings)

Do not let the context that produced a finding also confirm it. For each **confirmed breach** and each **"isolation is fine" sign-off**, get an independent check:

- Spawn a separate `general-purpose` (or `postgres-expert`) sub-agent with only the policy text + the pgTAP result and the claim. Its sole job: **disprove** it — find the missing policy that actually saves the day, the RESTRICTIVE layer you overlooked, the trigger that blocks the write, or (for a "safe" verdict) the untested statement type / role / AAL level that still leaks. Default to "the claim is wrong" until it can't refute.
- A breach survives only if the refuter also reproduces it (or can't explain it away). A clean bill survives only if the refuter can't find an unblocked vector.

This catches the two classic RLS review errors: (a) calling something a breach when a RESTRICTIVE/trigger/column-grant layer actually blocks it, and (b) calling something safe because you only tested SELECT.

---

## Stage 5 — Report

Lead with the verdict. Then per finding:

- ❌ **BREACH** `file:line` — attacker user X can {read/write/delete} tenant Y's data via `<statement>`. **Proof:** pgTAP `<test name>` fails to reject (or: static-only, unverified — with reason). **Fix:** the concrete policy/grant/`with check`/restrictive-layer change.
- ⚠️ **WEAKNESS** `file:line` — defense-in-depth gap (e.g. missing MFA restrictive policy, unwrapped `auth.uid()`, over-broad `grant execute`) that isn't an active breach today but removes a safety layer. Include why and the fix.
- ✅ **PROVEN** `table` — isolation holds for SELECT/INSERT/UPDATE/DELETE (+ MFA/admin where relevant); name the tests that prove it.

Isolation matrix (fill only in-scope tables):

| Table | SELECT | INSERT (with-check) | UPDATE (re-parent) | DELETE | MFA gate | Admin |
|---|---|---|---|---|---|---|
| … | ✅/❌/— | | | | | |

**Overall verdict:** ISOLATED / LEAKS / UNVERIFIED. Write it as a terse ship/no-ship call. List every ❌ BREACH as a numbered punch list to fix before merge, each with its failing test and the one-line fix.

Then run the repo's standard DB verification if you changed anything: `pnpm --filter web supabase:test`, and note whether `pnpm supabase:web:typegen` is needed.
