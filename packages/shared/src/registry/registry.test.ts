import { describe, expect, it, vi } from 'vitest';

import { createRegistry } from './index';

describe('createRegistry', () => {
  it('builds a fresh instance on every get, so no state is shared', async () => {
    const factory = vi.fn(() => ({ id: 'a' }));
    const registry = createRegistry<{ id: string }, 'a'>().register(
      'a',
      factory,
    );

    const [one, two] = await Promise.all([
      registry.get('a'),
      registry.get('a'),
    ]);
    const three = await registry.get('a');

    expect(one).toEqual({ id: 'a' });
    expect(one).not.toBe(two);
    expect(three).not.toBe(one);
    expect(factory).toHaveBeenCalledTimes(3);
  });

  it('returns a tuple for several names', async () => {
    const registry = createRegistry<string, 'a' | 'b'>()
      .register('a', () => 'A')
      .register('b', async () => 'B');

    expect(await registry.get('a', 'b')).toEqual(['A', 'B']);
  });

  it('retries a rejected factory on the next get', async () => {
    const factory = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('ok');

    const registry = createRegistry<string, 'a'>().register('a', factory);

    await expect(registry.get('a')).rejects.toThrow('boom');
    expect(await registry.get('a')).toBe('ok');
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('rejects a factory that returns nothing and retries on the next get', async () => {
    const factory = vi
      .fn<() => string | undefined>()
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce('ok');

    const registry = createRegistry<string | undefined, 'a'>().register(
      'a',
      factory,
    );

    await expect(registry.get('a')).rejects.toThrow(
      'Implementation "a" is not available',
    );
    expect(await registry.get('a')).toBe('ok');
  });

  it('rejects an unregistered name without falling back', async () => {
    const registry = createRegistry<string, 'a' | 'b'>().register(
      'a',
      () => 'A',
    );

    await expect(registry.get('b')).rejects.toThrow(
      'Implementation "b" not found',
    );
  });

  it('runs setup callbacks once before resolving', async () => {
    const callback = vi.fn(async () => {});
    const registry = createRegistry<string, 'a'>()
      .register('a', () => 'A')
      .addSetup('init', callback);

    await Promise.all([registry.get('a'), registry.get('a')]);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('retries a setup group that failed', async () => {
    const callback = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('setup failed'))
      .mockResolvedValueOnce(undefined);

    const registry = createRegistry<string, 'a'>()
      .register('a', () => 'A')
      .addSetup('init', callback);

    await expect(registry.get('a')).rejects.toThrow('setup failed');
    expect(await registry.get('a')).toBe('A');
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('retries only the failed setup callback', async () => {
    const ok = vi.fn(async () => {});
    const flaky = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('setup failed'))
      .mockResolvedValueOnce(undefined);

    const registry = createRegistry<string, 'a'>()
      .register('a', () => 'A')
      .addSetup('init', ok)
      .addSetup('init', flaky);

    await expect(registry.get('a')).rejects.toThrow('setup failed');
    expect(await registry.get('a')).toBe('A');
    expect(ok).toHaveBeenCalledTimes(1);
    expect(flaky).toHaveBeenCalledTimes(2);
  });

  it('runs a setup callback added after the group already ran', async () => {
    const late = vi.fn(async () => {});
    const registry = createRegistry<string, 'a'>()
      .register('a', () => 'A')
      .addSetup('init', async () => {});

    await registry.get('a');

    registry.addSetup('init', late);
    await registry.get('a');

    expect(late).toHaveBeenCalledTimes(1);
  });

  it('uses the new factory after a name is registered again', async () => {
    const registry = createRegistry<string, 'a'>().register('a', () => 'v1');

    expect(await registry.get('a')).toBe('v1');

    registry.register('a', () => 'v2');

    expect(await registry.get('a')).toBe('v2');
  });
});
