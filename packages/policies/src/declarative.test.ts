import { beforeEach, describe, expect, it, vi } from 'vitest';

import { definePolicy } from './declarative';
import { allow, deny } from './evaluator';
import type { PolicyContext, PolicyResult } from './types';

const logError = vi.fn();

vi.mock('@kit/shared/logger', () => ({
  getLogger: async () => ({ error: logError }),
}));

const ctx: PolicyContext = { timestamp: '2026-01-01T00:00:00.000Z' };

function policyReturning(evaluate: () => unknown) {
  return definePolicy({
    id: 'test.policy',
    evaluate: evaluate as () => Promise<PolicyResult>,
  });
}

const failed = (stage?: string) => ({
  allowed: false,
  reason: 'common.genericError',
  metadata: {
    code: 'POLICY_EVALUATION_ERROR',
    remediation: undefined,
    policyId: 'test.policy',
    stage,
  },
});

beforeEach(() => {
  logError.mockReset();
});

describe('definePolicy results', () => {
  it('yields allow() with policyId and stage in metadata', async () => {
    const result = await policyReturning(async () => allow({ checked: true }))
      .create(ctx)
      .evaluate('submission');

    expect(result).toEqual({
      allowed: true,
      reason: undefined,
      metadata: { checked: true, policyId: 'test.policy', stage: 'submission' },
    });
  });

  it('yields deny() with its message and code', async () => {
    const result = await policyReturning(async () =>
      deny({ code: 'LIMIT', message: 'Too many', remediation: 'Remove some' }),
    )
      .create(ctx)
      .evaluate();

    expect(result).toMatchObject({
      allowed: false,
      reason: 'Too many',
      metadata: { code: 'LIMIT', remediation: 'Remove some' },
    });
  });

  it("doesn't let a policy spoof its policyId or stage", async () => {
    const result = await policyReturning(async () =>
      allow({ policyId: 'other.policy', stage: 'other' }),
    )
      .create(ctx)
      .evaluate('submission');

    expect(result.metadata).toMatchObject({
      policyId: 'test.policy',
      stage: 'submission',
    });
  });
});

describe('definePolicy fails closed', () => {
  it.each([
    [
      'throws',
      () => {
        throw new Error('db password=secret');
      },
    ],
    ['rejects', () => Promise.reject(new Error('timeout'))],
    [
      'throws a non-Error',
      () => {
        throw 'boom';
      },
    ],
    ['returns undefined', () => undefined],
    ['returns null', () => null],
    ['returns true', () => true],
    ['returns {}', () => ({})],
    ['returns { allowed: "yes" }', () => ({ allowed: 'yes' })],
  ])('denies when the policy %s', async (_, evaluate) => {
    const result = await policyReturning(evaluate)
      .create(ctx)
      .evaluate('submission');

    expect(result).toEqual(failed('submission'));
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it('keeps the raw error out of the result', async () => {
    const result = await policyReturning(() => {
      throw new Error('db password=secret');
    })
      .create(ctx)
      .evaluate();

    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('denies when reading the result throws', async () => {
    const hostile = {
      allowed: true,
      get metadata(): never {
        throw new Error('getter');
      },
    };

    const result = await policyReturning(() => hostile)
      .create(ctx)
      .evaluate();

    expect(result).toEqual(failed());
  });

  it('still denies when logging the error throws', async () => {
    logError.mockImplementation(() => {
      throw new Error('logger down');
    });

    const result = await policyReturning(() => {
      throw new Error('x');
    })
      .create(ctx)
      .evaluate();

    expect(result).toEqual(failed());
  });

  it('reads allowed once and returns a plain result', async () => {
    let reads = 0;

    const flipping = {
      get allowed() {
        reads += 1;
        return reads === 1 ? false : true;
      },
    };

    const result = await policyReturning(() => flipping)
      .create(ctx)
      .evaluate();

    expect(result.allowed).toBe(false);
    expect(reads).toBe(1);
    expect(Object.hasOwn(result, 'allowed')).toBe(true);
  });

  it('drops a non-string reason so internals never reach users', async () => {
    const result = await policyReturning(() => ({
      allowed: false,
      reason: new Error('db password=secret'),
    }))
      .create(ctx)
      .evaluate();

    expect(result.reason).toBeUndefined();
  });

  it('is denied like a reject when the policy throws synchronously', async () => {
    const result = await policyReturning(() => {
      throw new Error('sync');
    })
      .create(ctx)
      .evaluate();

    expect(result).toEqual(failed());
  });
});

describe('policy definitions are frozen', () => {
  it("can't be patched to skip the fail-closed wrapper", () => {
    const stages = ['preliminary'];
    const policy = definePolicy({
      id: 'p',
      stages,
      evaluate: async () => allow(),
    });

    expect(Object.isFrozen(policy)).toBe(true);
    expect(() => {
      (policy as { create: unknown }).create = () => ({});
    }).toThrow(TypeError);

    stages.push('submission');

    expect(policy.stages).toEqual(['preliminary']);
    expect(Object.isFrozen(policy.stages)).toBe(true);
  });
});

describe('stages', () => {
  it('rejects an empty list, which would run only when no stage is given', () => {
    expect(() =>
      definePolicy({ id: 'p', stages: [], evaluate: async () => allow() }),
    ).toThrow('Policy "p" has empty stages');
  });
});
