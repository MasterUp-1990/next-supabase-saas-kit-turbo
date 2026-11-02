# @kit/policies — Registry-Based Policy System

## Non-Negotiables

1. ALWAYS use `definePolicy` with a unique `id` and register in a registry via `createPolicyRegistry()`
2. NEVER write inline policies in feature code — define in a registry file
3. ALWAYS use `allow()`/`deny()` returns with error codes and remediation messages
4. ALWAYS assign stages (`preliminary`, `submission`) for stage-aware evaluation
5. ALWAYS evaluate through `createPoliciesEvaluator()` and `evaluator.evaluate(registry, context, operator, stage)` —
   it runs every registered policy for the stage. Guard with `evaluator.hasPoliciesForStage(registry, stage)` when an
   empty registry should short-circuit. See `invitation-policies.ts` next to the exemplar.
6. Only when a policy needs per-call config (e.g. `['max-invitations', { maxInvitations: 5 }]`): load it with
   `createPoliciesFromRegistry(registry, specs)` and run the result with `evaluator.evaluatePolicies(policies, context,
   operator, stage)` (or `evaluateGroups()` for staged AND/OR groups). `evaluate(registry, …)` does not pass config.
7. NEVER evaluate policies without specifying an operator (`'ALL'` = AND, `'ANY'` = OR); any other value throws
8. Policies fail closed: a throw, a reject or anything but a `{ allowed: boolean }` result denies with
   `POLICY_EVALUATION_ERROR` / `common.genericError`, and the raw error goes to the server log only. Don't catch inside a
   policy to return `allow()`, and never put raw error text in `reason` or `metadata`: results can reach the browser.
9. `registerPolicy` only accepts `definePolicy` results; definitions are frozen. Don't hand-build policy objects.
10. `metadata.policyId` and `metadata.stage` are set by the kit; don't rely on overriding them.
11. Keep `stage` strings exact: a typo filters every stage-scoped policy out, and `'ALL'` then allows.
12. `stages: []` throws in `definePolicy`; omit `stages` to run a policy in every stage.

## Verification

- `pnpm --filter @kit/policies test:unit`

## Key Imports

- `definePolicy`, `allow`, `deny`, `createPolicyRegistry`, `createPoliciesFromRegistry`, `createPoliciesEvaluator` — all from `@kit/policies`

## Exemplar

- `packages/features/team-accounts/src/server/policies/policies.ts` — real-world registry with stage-aware, configurable policies
- `packages/features/team-accounts/src/server/policies/invitation-policies.ts` — evaluator wrapper calling `evaluator.evaluate()`
