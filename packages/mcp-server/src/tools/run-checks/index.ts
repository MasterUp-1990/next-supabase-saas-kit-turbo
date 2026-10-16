import { registerRepoChecksTools as registerRepoChecksMcpTools } from '@makerkit/repo-checks/mcp';
import type { RepoChecksServices } from '@makerkit/repo-checks/mcp';
import { createRepoChecksServices } from '@makerkit/repo-checks/node';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { KIT_SCRIPT_CATALOG } from '../scripts/index';

/**
 * run_checks, get_scripts, get_script_details, get_healthcheck_scripts and
 * deps_upgrade_advisor come from @makerkit/repo-checks, under their existing
 * unprefixed names. The kit adds the guidance for its own root scripts.
 */
export function registerRepoChecksTools(
  server: McpServer,
  rootPath?: string,
  services: RepoChecksServices = createKitRepoChecksServices(rootPath),
) {
  registerRepoChecksMcpTools(server, services);
}

export function createKitRepoChecksServices(
  rootPath = process.cwd(),
): RepoChecksServices {
  return createRepoChecksServices(rootPath, {
    packageManager: 'pnpm',
    catalog: KIT_SCRIPT_CATALOG,
  });
}

export {
  createRunChecksService,
  parseDiagnostics,
  type Diagnostic,
  type RunChecksDeps,
  type RunChecksOutput,
} from '@makerkit/repo-checks';
