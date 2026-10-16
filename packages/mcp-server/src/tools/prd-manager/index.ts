import { type PrdDeps, createPrdService } from '@makerkit/prd';
import { registerPRDTools as registerPrdMcpTools } from '@makerkit/prd/mcp';
import { createNodePrdDeps } from '@makerkit/prd/node';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { createKitRepoChecksServices } from '../run-checks/index';

/**
 * The PRD format, rules and MCP tools come from @makerkit/prd. The kit adds
 * one thing: a story is only completed when the kit's run_checks passes, so
 * the agent gets file-and-line diagnostics when it does not.
 */

/** Check-only scripts that gate marking a story as completed. */
const COMPLETION_CHECKS = ['typecheck', 'lint'];

export function registerPRDTools(
  server: McpServer,
  rootPath?: string,
  deps: PrdDeps = createPrdDeps(rootPath),
) {
  registerPrdMcpTools(server, createPrdService(deps));
}

export function createPrdDeps(rootPath = process.cwd()): PrdDeps {
  return createNodePrdDeps(rootPath, {
    verifyCompletion: createRunChecksVerifier(rootPath),
  });
}

function createRunChecksVerifier(
  rootPath: string,
): PrdDeps['verifyCompletion'] {
  const checks = createKitRepoChecksServices(rootPath).runChecks;

  return async () => {
    const result = await checks.run({ scripts: COMPLETION_CHECKS });

    return {
      passed: result.overall === 'pass',
      checks: result.scripts_requested,
      errors: result.summary.errors,
      warnings: result.summary.warnings,
      diagnostics: result.diagnostics.map((d) => ({
        file: d.file,
        line: d.line,
        message: d.message,
        severity: d.severity,
      })),
      // Checks that failed without parseable diagnostics (missing script,
      // spawn failure, timeout): surface the reason instead of "0 errors".
      messages: result.checks
        .filter(
          (check) => check.status !== 'pass' && check.diagnostics.length === 0,
        )
        .map((check) => {
          const detail = (check.message ?? check.stderr ?? '')
            .trim()
            .slice(0, 300);

          return `${check.script}: ${check.status}${detail ? ` (${detail})` : ''}`;
        }),
    };
  };
}

export {
  createPrdService,
  normalizePrd,
  type PrdDeps,
  type PrdVerificationResult,
  type StructuredPRD,
  type UserStory,
  type StoryStatus,
  type ListPrdsOutput,
  type PrdSummary,
} from '@makerkit/prd';
