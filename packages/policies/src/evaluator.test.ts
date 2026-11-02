import { describe, expect, it, vi } from 'vitest';

import { definePolicy } from './declarative';
import {
  allow,
  createPoliciesEvaluator,
  createPolicy,
  deny,
} from './evaluator';
import { createPolicyRegistry } from './registry';
import type { PolicyContext, PolicyResult } from './types';

vi.mock('@kit/shared/logger', () => ({
  getLogger: async () => ({ error: vi.fn() }),
}));

const ctx: PolicyContext = { timestamp: '2026-01-01T00:00:00.000Z' };

describe('PoliciesEvaluator', () => {
  it('falls back to a generic reason when a deny has none', async () => {
    const registry = createPolicyRegistry().registerPolicy(
      definePolicy({
        id: 'no-reason',
        evaluate: async () => ({ allowed: false }),
      }),
    );

    const result = await createPoliciesEvaluator().evaluate(
      registry,
      ctx,
      'ALL',
    );

    expect(result).toMatchObject({
      allowed: false,
      reasons: ['common.genericError'],
    });
  });

  it('throws on an unknown operator instead of guessing', async () => {
    const registry = createPolicyRegistry().registerPolicy(
      definePolicy({ id: 'a', evaluate: async () => allow() }),
    );

    const evaluator = createPoliciesEvaluator();

    await expect(
      evaluator.evaluate(registry, ctx, 'all' as 'ALL'),
    ).rejects.toThrow('Unknown policy operator "all"');
    await expect(
      evaluator.evaluatePolicies([async () => allow()], ctx, 'some' as 'ANY'),
    ).rejects.toThrow('Unknown policy operator "some"');
  });

  it('denies a plain policy function that throws or returns a non-result', async () => {
    const evaluator = createPoliciesEvaluator();

    const throwing = createPolicy(async () => {
      throw new Error('db password=secret');
    });

    const truthy = createPolicy(
      async () => ({ allowed: 'yes' }) as unknown as PolicyResult,
    );

    for (const policy of [throwing, truthy]) {
      const result = await evaluator.evaluatePolicies([policy], ctx, 'ANY');

      expect(result.allowed).toBe(false);
      expect(result.results[0]).toMatchObject({
        allowed: false,
        reason: 'common.genericError',
        metadata: { code: 'POLICY_EVALUATION_ERROR' },
      });
      expect(JSON.stringify(result)).not.toContain('secret');
    }
  });

  it('keeps existing ALL/ANY behaviour', async () => {
    const evaluator = createPoliciesEvaluator();
    const pass = createPolicy(async () => allow());
    const fail = createPolicy(async () => deny('nope'));

    expect(
      (await evaluator.evaluatePolicies([pass, fail], ctx, 'ALL')).allowed,
    ).toBe(false);
    expect(
      (await evaluator.evaluatePolicies([fail, pass], ctx, 'ANY')).allowed,
    ).toBe(true);
  });
});
