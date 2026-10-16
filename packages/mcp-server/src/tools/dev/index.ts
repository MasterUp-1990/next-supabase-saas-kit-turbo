import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import {
  execFileAsync,
  findProcessesByName,
  getPortProcess,
  killProcess,
  spawnDetached,
} from '../../lib/process-utils';
import { resolveSupabaseConfig } from '../../lib/supabase-config';
import { MUTATING_TOOL, READ_ONLY_TOOL } from '../../lib/tool-response';
import {
  DEFAULT_PORT_CONFIG,
  type KitDevServiceDeps,
  createKitDevService,
} from './kit-dev.service';
import {
  KitDevStartInputSchema,
  KitDevStartOutputSchema,
  KitDevStatusInputSchema,
  KitDevStatusOutputSchema,
  KitDevStopInputSchema,
  KitDevStopOutputSchema,
  KitMailboxStatusInputSchema,
  KitMailboxStatusOutputSchema,
} from './schema';

import { access, readFile } from 'node:fs/promises';
import { Socket } from 'node:net';
import { join } from 'node:path';

export function registerKitDevTools(server: McpServer, rootPath?: string) {
  const service = createKitDevService(createKitDevDeps(rootPath));

  server.registerTool(
    'kit_dev_start',
    {
      description: 'Start all or selected local development services',
      inputSchema: KitDevStartInputSchema,
      outputSchema: KitDevStartOutputSchema,
      annotations: MUTATING_TOOL,
    },
    async (input) => {
      const parsedInput = KitDevStartInputSchema.parse(input);

      try {
        const result = await service.start(parsedInput);

        return {
          structuredContent: result,
          content: [{ type: 'text', text: JSON.stringify(result) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `kit_dev_start failed: ${toErrorMessage(error)}`,
            },
          ],
        };
      }
    },
  );

  server.registerTool(
    'kit_dev_stop',
    {
      description: 'Stop all or selected local development services',
      inputSchema: KitDevStopInputSchema,
      outputSchema: KitDevStopOutputSchema,
      annotations: MUTATING_TOOL,
    },
    async (input) => {
      const parsedInput = KitDevStopInputSchema.parse(input);

      try {
        const result = await service.stop(parsedInput);

        return {
          structuredContent: result,
          content: [{ type: 'text', text: JSON.stringify(result) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `kit_dev_stop failed: ${toErrorMessage(error)}`,
            },
          ],
        };
      }
    },
  );

  server.registerTool(
    'kit_dev_status',
    {
      description:
        'Check status for app, database, mailbox, and stripe local services',
      inputSchema: KitDevStatusInputSchema,
      outputSchema: KitDevStatusOutputSchema,
      annotations: READ_ONLY_TOOL,
    },
    async (input) => {
      KitDevStatusInputSchema.parse(input);

      try {
        const result = await service.status();

        return {
          structuredContent: result,
          content: [{ type: 'text', text: JSON.stringify(result) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `kit_dev_status failed: ${toErrorMessage(error)}`,
            },
          ],
        };
      }
    },
  );

  server.registerTool(
    'kit_mailbox_status',
    {
      description:
        'Check local mailbox health with graceful fallback fields for UI state',
      inputSchema: KitMailboxStatusInputSchema,
      outputSchema: KitMailboxStatusOutputSchema,
      annotations: READ_ONLY_TOOL,
    },
    async (input) => {
      KitMailboxStatusInputSchema.parse(input);

      try {
        const result = await service.mailboxStatus();

        return {
          structuredContent: result,
          content: [{ type: 'text', text: JSON.stringify(result) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `kit_mailbox_status failed: ${toErrorMessage(error)}`,
            },
          ],
        };
      }
    },
  );
}

export function createKitDevDeps(rootPath = process.cwd()): KitDevServiceDeps {
  return {
    rootPath,
    async resolveVariantContext() {
      const packageJson = await readJsonIfPresent(
        join(rootPath, 'apps', 'web', 'package.json'),
      );
      const hasSupabase = await pathExists(
        join(rootPath, 'apps', 'web', 'supabase'),
      );

      const dependencies = {
        ...(packageJson?.dependencies ?? {}),
        ...(packageJson?.devDependencies ?? {}),
      } as Record<string, unknown>;

      const framework =
        'react-router' in dependencies || '@react-router/dev' in dependencies
          ? 'react-router'
          : 'nextjs';

      if (hasSupabase) {
        return {
          variant:
            framework === 'react-router'
              ? 'react-router-supabase'
              : 'next-supabase',
          variantFamily: 'supabase',
          framework,
        } as const;
      }

      return {
        variant:
          framework === 'react-router'
            ? 'react-router-drizzle'
            : 'next-drizzle',
        variantFamily: 'orm',
        framework,
      } as const;
    },
    async resolvePortConfig() {
      // Single source of truth for local Supabase ports (see lib/supabase-config).
      const { ports } = await resolveSupabaseConfig(rootPath);

      return {
        appPort: DEFAULT_PORT_CONFIG.appPort,
        supabaseApiPort: ports.api,
        supabaseStudioPort: ports.studio,
        mailboxApiPort: ports.mailbox,
        // Supabase's managed Mailpit serves its UI and API on the same
        // config.toml port; 8025 is standalone Mailpit's default and
        // would be reported as a live URL nothing is listening on.
        mailboxPort: ports.mailbox,
        ormDbPort: DEFAULT_PORT_CONFIG.ormDbPort,
        stripeWebhookPath: DEFAULT_PORT_CONFIG.stripeWebhookPath,
      };
    },
    async executeCommand(command: string, args: string[]) {
      const result = await executeWithFallback(rootPath, command, args);

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: 0,
      };
    },
    async spawnDetached(command: string, args: string[]) {
      const child = spawnDetached(command, args, { cwd: rootPath });

      if (!child.pid) {
        throw new Error(`Failed to spawn ${command}`);
      }

      return {
        pid: child.pid,
      };
    },
    async isPortOpen(port: number) {
      return checkPort(port);
    },
    async fetchJson(url: string) {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }

      return response.json();
    },
    async getPortProcess(port: number) {
      return getPortProcess(port, rootPath);
    },
    async isProcessRunning(pid: number) {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    },
    async findProcessesByName(pattern: string) {
      return findProcessesByName(pattern, rootPath);
    },
    async killProcess(pid: number, signal = 'SIGTERM') {
      return killProcess(pid, signal);
    },
    async sleep(ms: number) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    },
  };
}

async function executeWithFallback(
  rootPath: string,
  command: string,
  args: string[],
) {
  try {
    return await execFileAsync(command, args, {
      cwd: rootPath,
    });
  } catch (error) {
    if (isLocalCliCandidate(command)) {
      const localBinCandidates = [
        join(rootPath, 'node_modules', '.bin', command),
        join(rootPath, 'apps', 'web', 'node_modules', '.bin', command),
      ];

      for (const localBin of localBinCandidates) {
        try {
          return await execFileAsync(localBin, args, {
            cwd: rootPath,
          });
        } catch {
          // Try next local binary candidate.
        }
      }

      try {
        return await execFileAsync('pnpm', ['exec', command, ...args], {
          cwd: rootPath,
        });
      } catch {
        return execFileAsync(
          'pnpm',
          ['--filter', 'web', 'exec', command, ...args],
          {
            cwd: rootPath,
          },
        );
      }
    }

    throw error;
  }
}

function isLocalCliCandidate(command: string) {
  return command === 'supabase' || command === 'stripe';
}

async function pathExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJsonIfPresent(path: string) {
  try {
    const content = await readFile(path, 'utf8');
    return JSON.parse(content) as {
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
    };
  } catch {
    return null;
  }
}

async function checkPort(port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = new Socket();

    socket.setTimeout(200);

    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, '127.0.0.1');
  });
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
}

export { createKitDevService, DEFAULT_PORT_CONFIG } from './kit-dev.service';
export type { KitDevServiceDeps, PortConfig } from './kit-dev.service';
export type {
  KitDevStartOutput,
  KitDevStatusOutput,
  KitDevStopOutput,
} from './schema';
