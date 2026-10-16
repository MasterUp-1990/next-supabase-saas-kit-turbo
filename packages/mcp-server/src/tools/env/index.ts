import {
  type EnvInspectorDeps,
  type EnvInspectorSettings,
  EnvInspectorService,
  NEXTJS_ENV_FILES,
  processEnvDefinitions as processEnvFileDefinitions,
  scanEnvFiles,
} from '@makerkit/env-inspector';
import { registerEnvInspectorTools } from '@makerkit/env-inspector/mcp';
import { createEnvInspectorDeps } from '@makerkit/env-inspector/node';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { findWorkspaceRoot } from '../../resolve-root';
import { envVariables } from './model';
import type { AppEnvState, EnvFileInfo, EnvMode, ScanOptions } from './types';

/**
 * The kit_env_* tools come from @makerkit/env-inspector. The kit passes its
 * variable model (./model) and reads apps/web with the Next.js env file order.
 * Values are shown as they are: this is a local development tool.
 */
const KIT_ENV_FILES: Record<EnvMode, readonly string[]> = {
  development: NEXTJS_ENV_FILES['development'] ?? [],
  production: NEXTJS_ENV_FILES['production'] ?? [],
};

export const KIT_ENV_SETTINGS: EnvInspectorSettings = {
  model: envVariables,
  apps: [{ name: 'web', path: 'apps/web' }],
  envFiles: KIT_ENV_FILES,
  revealValues: true,
  // Next.js loads .env.local over .env.development (and .env.production.local
  // over .env.production), so writing public values to the committed files
  // could leave them hidden behind a local copy. Every write goes to the local
  // file, as the kit did before the env-inspector package.
  writeTargets: {
    development: { secret: '.env.local', nonSecret: '.env.local' },
    production: {
      secret: '.env.production.local',
      nonSecret: '.env.production.local',
    },
  },
};

export type KitEnvDeps = EnvInspectorDeps;

/** The package service, typed with the kit's two modes. */
export class KitEnvService extends EnvInspectorService {
  override getAppState(mode: EnvMode = 'development') {
    return super.getAppState(mode) as Promise<AppEnvState[]>;
  }
}

export function registerKitEnvTools(
  server: McpServer,
  rootPath?: string,
  service: KitEnvService = createKitEnvService(createKitEnvDeps(rootPath)),
) {
  registerEnvInspectorTools(server, service, { prefix: 'kit_' });
}

export function createKitEnvDeps(rootPath = process.cwd()): KitEnvDeps {
  return createEnvInspectorDeps(rootPath, { settings: KIT_ENV_SETTINGS });
}

export function createKitEnvService(deps: KitEnvDeps = createKitEnvDeps()) {
  return new KitEnvService(deps);
}

/** The effective value of one web app variable, read from the workspace root. */
export function getVariable(key: string, mode: EnvMode) {
  return createWorkspaceEnvService().getVariable(key, mode);
}

/** The resolved and validated variables of the web app for `mode`. */
export function getEnvState(options: ScanOptions) {
  return createWorkspaceEnvService(options.rootDir).getAppState(options.mode);
}

/** The definitions of every web app variable, in precedence order. */
export function scanMonorepoEnv(options: ScanOptions): Promise<EnvFileInfo[]> {
  const deps = createKitEnvDeps(
    options.rootDir ?? findWorkspaceRoot(process.cwd()),
  );

  return scanEnvFiles({
    rootPath: deps.rootPath,
    mode: options.mode,
    fs: deps,
    apps: KIT_ENV_SETTINGS.apps,
    envFiles: KIT_ENV_FILES,
  });
}

export function processEnvDefinitions(envInfo: EnvFileInfo, mode: EnvMode) {
  return processEnvFileDefinitions(envInfo, mode, {
    model: envVariables,
    envFiles: KIT_ENV_FILES,
  }) as AppEnvState;
}

function createWorkspaceEnvService(rootPath?: string) {
  return createKitEnvService(
    createKitEnvDeps(rootPath ?? findWorkspaceRoot(process.cwd())),
  );
}

export { envVariables, findWorkspaceRoot };
export type { EnvVariableModel } from './model';
export type {
  AppEnvState,
  EnvFileInfo,
  EnvMode,
  EnvVariableState,
} from './types';
