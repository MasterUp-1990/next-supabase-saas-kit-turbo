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
7. NEVER evaluate policies without specifying an operator (`'ALL'` = AND, `'ANY'` = OR)

## Key Imports

- `definePolicy`, `allow`, `deny`, `createPolicyRegistry`, `createPoliciesFromRegistry`, `createPoliciesEvaluator` — all from `@kit/policies`

## Exemplar

- `packages/features/team-accounts/src/server/policies/policies.ts` — real-world registry with stage-aware, configurable policies
- `packages/features/team-accounts/src/server/policies/invitation-policies.ts` — evaluator wrapper calling `evaluator.evaluate()`
