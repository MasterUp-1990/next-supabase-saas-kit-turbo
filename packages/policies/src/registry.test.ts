import { describe, expect, it } from 'vitest';

import { definePolicy } from './declarative';
import { allow } from './evaluator';
import { createPolicyRegistry } from './registry';

const policy = (id: string) =>
  definePolicy({ id, evaluate: async () => allow() });

describe('createPolicyRegistry', () => {
  it('registers policies in order and returns them', async () => {
    const a = policy('a');
    const registry = createPolicyRegistry()
      .registerPolicy(a)
      .registerPolicy(policy('b'));

    expect(registry.listPolicies()).toEqual(['a', 'b']);
    expect(await registry.getPolicy('a')).toBe(a);
  });

  it('throws for a duplicate or unknown id', async () => {
    const registry = createPolicyRegistry().registerPolicy(policy('a'));

    expect(() => registry.registerPolicy(policy('a'))).toThrow(
      'Policy with ID "a" is already registered',
    );
    await expect(registry.getPolicy('toString')).rejects.toThrow(
      'Policy with ID "toString" is not registered',
    );
  });

  it('rejects a definition not created with definePolicy', () => {
    const registry = createPolicyRegistry();

    const handMade = {
      id: 'hand-made',
      create: () => ({
        evaluate: async () => ({ allowed: true }),
        getContext: () => ({ timestamp: '' }),
      }),
    };

    expect(() => registry.registerPolicy(handMade)).toThrow(
      'Policy "hand-made" must be created with definePolicy',
    );
    expect(registry.hasPolicy('hand-made')).toBe(false);
  });
});
