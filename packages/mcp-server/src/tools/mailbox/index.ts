import {
  type MailpitDeps,
  type MailpitService,
  type MailpitSettings,
  createMailpitService,
} from '@makerkit/mailpit';
import { registerMailpitTools } from '@makerkit/mailpit/mcp';
import { createMailpitDeps } from '@makerkit/mailpit/node';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { resolveSupabaseConfig } from '../../lib/supabase-config';

/**
 * kit_emails_list, kit_emails_read and kit_emails_set_read_status come from
 * @makerkit/mailpit. Mailpit runs inside the local Supabase stack, on the port
 * from apps/web/supabase/config.toml. kit_mailbox_status stays in ../dev.
 */
export function registerKitEmailsTools(
  server: McpServer,
  rootPath?: string,
  service: MailpitService = createKitMailboxService(
    createKitMailboxDeps(rootPath),
  ),
) {
  registerMailpitTools(server, service, { prefix: 'kit_', statusTool: false });
}

export function createKitMailboxSettings(
  rootPath = process.cwd(),
): MailpitSettings {
  return {
    // Read on every call, so a port change in config.toml applies at once.
    async url() {
      const { ports } = await resolveSupabaseConfig(rootPath);

      return `http://127.0.0.1:${ports.mailbox}`;
    },
    startHint: 'Start Supabase with "pnpm supabase:web:start".',
  };
}

export function createKitMailboxDeps(rootPath = process.cwd()): MailpitDeps {
  return createMailpitDeps(rootPath, {
    settings: createKitMailboxSettings(rootPath),
  });
}

export const createKitMailboxService = createMailpitService;

export type KitMailboxDeps = MailpitDeps;

export type {
  EmailsListOutput as KitEmailsListOutput,
  EmailsReadOutput as KitEmailsReadOutput,
  EmailsSetReadStatusOutput as KitEmailsSetReadStatusOutput,
} from '@makerkit/mailpit';
