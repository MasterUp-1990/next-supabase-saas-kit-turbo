import type { z } from 'zod';

import { getLogger } from '@kit/shared/logger';

import type { PolicyContext, PolicyResult, PolicyStage } from './types';

/**
 * Error code for structured policy failures
 */
export interface PolicyErrorCode {
  /** Machine-readable error code */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Optional remediation instructions */
  remediation?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Enhanced policy result with structured error information
 */
export interface PolicyReason extends PolicyErrorCode {
  /** Policy ID that generated this reason */
  policyId: string;
  /** Stage at which this reason was generated */
  stage?: PolicyStage;
}

/**
 * Policy evaluator function with immutable context
 */
export interface PolicyEvaluator<TContext extends PolicyContext> {
  /** Evaluate the policy for a specific stage */
  evaluate(stage?: PolicyStage): Promise<PolicyResult>;

  /** Get the immutable context */
  getContext(): Readonly<TContext>;
}

/**
 * Policy definition factory configuration
 */
export interface FeaturePolicyDefinition<
  TContext extends PolicyContext = PolicyContext,
  TConfig = unknown,
> {
  /** Unique policy identifier */
  id: string;

  /** Optional stages this policy applies to */
  stages?: PolicyStage[];

  /** Optional configuration schema for validation */
  configSchema?: z.ZodType<TConfig>;

  /** Factory function to create evaluator instances */
  create(context: TContext, config?: TConfig): PolicyEvaluator<TContext>;
}

/**
 * Helper function to create a successful policy result
 */
export function allow(metadata?: Record<string, unknown>): PolicyResult {
  return {
    allowed: true,
    metadata,
  };
}

/**
 * Helper function to create a failed policy result with structured error
 */
export function deny(error: PolicyErrorCode): PolicyResult {
  return {
    allowed: false,
    reason: error.message,
    metadata: {
      code: error.code,
      remediation: error.remediation,
      ...error.metadata,
    },
  };
}

/**
 * Deep freeze an object and all its nested properties
 */
function deepFreeze<T>(obj: T, visited = new WeakSet()): Readonly<T> {
  // Prevent infinite recursion with circular references
  if (visited.has(obj as object)) {
    return obj;
  }

  visited.add(obj as object);

  // Get all property names
  const propNames = Reflect.ownKeys(obj as object);

  // Freeze properties before freezing self
  for (const name of propNames) {
    const value = (obj as Record<string, unknown>)[name as string];

    if ((value && typeof value === 'object') || typeof value === 'function') {
      deepFreeze(value, visited);
    }
  }

  return Object.freeze(obj);
}

/**
 * Safe cloning that handles functions and other non-cloneable objects
 */
function safeClone<T>(obj: T): T {
  try {
    return structuredClone(obj);
  } catch {
    // If structuredClone fails (e.g., due to functions), create a shallow clone
    // and recursively clone cloneable properties
    if (obj && typeof obj === 'object') {
      const cloned = Array.isArray(obj) ? ([] as unknown as T) : ({} as T);

      for (const [key, value] of Object.entries(obj)) {
        try {
          // Try to clone individual properties
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (cloned as any)[key] = structuredClone(value);
        } catch {
          // If individual property can't be cloned (like functions), keep as-is
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (cloned as any)[key] = value;
        }
      }

      return cloned;
    }

    // For primitives or non-cloneable objects, return as-is
    return obj;
  }
}

/**
 * Creates an immutable context wrapper
 */
function createImmutableContext<T extends PolicyContext>(
  context: T,
): Readonly<T> {
  // Safely clone the context, handling functions and other edge cases
  const cloned = safeClone(context);

  // Deep freeze the object to make it immutable
  return deepFreeze(cloned);
}

// definitions built by definePolicy; the registry accepts only these, so
// every registered policy fails closed
const definedPolicies = new WeakSet<object>();

export function isDefinedPolicy(definition: object) {
  return definedPolicies.has(definition);
}

/**
 * Reads each field once and rebuilds a plain result, so getters, proxies and
 * class instances can't make the checked value differ from the returned one.
 * Returns `null` for anything but a `{ allowed: boolean }` object.
 */
export function toPolicyResult(value: unknown): PolicyResult | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const { allowed, reason, metadata, requiresManualReview } = value as Record<
    string,
    unknown
  >;

  if (typeof allowed !== 'boolean') {
    return null;
  }

  return {
    allowed,
    reason: typeof reason === 'string' ? reason : undefined,
    ...(typeof requiresManualReview === 'boolean'
      ? { requiresManualReview }
      : {}),
    metadata:
      typeof metadata === 'object' && metadata !== null
        ? { ...metadata }
        : undefined,
  };
}

/**
 * The deny returned when a policy throws, rejects or returns a non-result.
 * Results are returned to callers that serialize them to the browser, so the
 * raw error only goes to the server log.
 */
export async function failedEvaluation(params: {
  error: unknown;
  policyId?: string;
  stage?: PolicyStage;
}) {
  const { policyId, stage, error } = params;

  try {
    const logger = await getLogger();

    logger.error(
      { name: 'policy-evaluation', policyId, stage, error },
      'Policy evaluation failed',
    );
  } catch {
    // logging must never turn a deny into a crash
  }

  return deny({
    code: 'POLICY_EVALUATION_ERROR',
    message: 'common.genericError',
    metadata: { policyId, stage },
  });
}

/**
 * Factory function to define a policy with metadata and configuration.
 * The policy fails closed: a throw, a reject or anything but a
 * `{ allowed: boolean }` result denies with `POLICY_EVALUATION_ERROR`.
 * The definition and its stages are frozen.
 */
export function definePolicy<
  TContext extends PolicyContext = PolicyContext,
  TConfig = unknown,
>(config: {
  /** Unique policy identifier */
  id: string;

  /** Optional stages this policy applies to */
  stages?: PolicyStage[];

  /** Optional configuration schema for validation */
  configSchema?: z.ZodType<TConfig>;

  /** Policy implementation function */
  evaluate: (
    context: Readonly<TContext>,
    config?: TConfig,
    stage?: PolicyStage,
  ) => Promise<PolicyResult>;
}): FeaturePolicyDefinition<TContext, TConfig> {
  const { id, configSchema } = config;

  // `[]` would run only when no stage is given, which is never what's meant
  if (config.stages?.length === 0) {
    throw new Error(
      `Policy "${id}" has empty stages; omit stages to run in every stage`,
    );
  }

  const evaluate = config.evaluate.bind(config);
  const stages = config.stages && Object.freeze([...config.stages]);

  const definition: FeaturePolicyDefinition<TContext, TConfig> = Object.freeze({
    id,
    // frozen at runtime; typed mutable to keep the existing interface
    stages: stages as PolicyStage[] | undefined,
    configSchema,

    create(context: TContext, policyConfig?: TConfig) {
      // Validate configuration if schema is provided
      if (configSchema && policyConfig !== undefined) {
        const validation = configSchema.safeParse(policyConfig);

        if (!validation.success) {
          throw new Error(
            `Invalid configuration for policy "${id}": ${validation.error.message}`,
          );
        }
      }

      // Create immutable context
      const immutableContext = createImmutableContext(context);

      return {
        async evaluate(stage?: PolicyStage) {
          // Check if this policy should run at this stage
          if (stage && stages && !stages.includes(stage)) {
            return allow({
              skipped: true,
              reason: `Policy not applicable for stage: ${stage}`,
            });
          }

          try {
            const value = await evaluate(immutableContext, policyConfig, stage);

            const result = toPolicyResult(value);

            if (!result) {
              return failedEvaluation({
                policyId: id,
                stage,
                error: new TypeError(
                  'Policy did not return a { allowed: boolean } result',
                ),
              });
            }

            // policyId and stage last, so a policy can't spoof them
            return {
              ...result,
              metadata: { ...result.metadata, policyId: id, stage },
            };
          } catch (error) {
            return failedEvaluation({ policyId: id, stage, error });
          }
        },

        getContext() {
          return immutableContext;
        },
      };
    },
  });

  definedPolicies.add(definition);

  return definition;
}
