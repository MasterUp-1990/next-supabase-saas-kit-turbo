export type ImplementationFactory<T> = () => T | Promise<T>;

export interface Registry<T, Names extends string> {
  register: (
    name: Names,
    factory: ImplementationFactory<T>,
  ) => Registry<T, Names>;

  get: {
    (name: Names): Promise<T>;
    <K extends [Names, ...Names[]]>(
      ...names: K
    ): Promise<{ [P in keyof K]: T }>;
  };

  setup: (group?: string) => Promise<void>;

  addSetup: (
    group: string,
    callback: () => Promise<void>,
  ) => Registry<T, Names>;
}

/**
 * Name → lazy factory map. `get` runs the factory on every call and returns
 * a fresh instance, so no state is shared between requests or users. A
 * setup callback runs once; a failed one is retried on the next call.
 */
export function createRegistry<T, Names extends string = string>() {
  const factories = new Map<Names, ImplementationFactory<T>>();

  const setupGroups = new Map<
    string,
    Array<{ callback: () => Promise<void>; run?: Promise<void> }>
  >();

  async function build(name: Names) {
    const factory = factories.get(name);

    if (!factory) {
      throw new Error(`Implementation "${name}" not found`);
    }

    const implementation = await factory();

    if (!implementation) {
      throw new Error(`Implementation "${name}" is not available`);
    }

    return implementation;
  }

  // Each callback runs once; a failed one is retried on the next setup, and
  // callbacks added after the group ran still run.
  async function runGroup(name: string) {
    const steps = setupGroups.get(name) ?? [];

    await Promise.all(
      steps.map((step) => {
        if (!step.run) {
          const run = Promise.resolve().then(step.callback);

          step.run = run;

          run.catch(() => {
            if (step.run === run) {
              step.run = undefined;
            }
          });
        }

        return step.run;
      }),
    );
  }

  const registry: Registry<T, Names> = {
    register(name, factory) {
      factories.set(name, factory);
      return registry;
    },

    get: (async (...names: Names[]) => {
      await registry.setup();

      const instances = names.map((name) => build(name));

      return names.length === 1 ? instances[0] : Promise.all(instances);
    }) as Registry<T, Names>['get'],

    async setup(group) {
      if (group) {
        return runGroup(group);
      }

      await Promise.all([...setupGroups.keys()].map(runGroup));
    },

    addSetup(group, callback) {
      const steps = setupGroups.get(group) ?? [];

      steps.push({ callback });
      setupGroups.set(group, steps);

      return registry;
    },
  };

  return registry;
}
