import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { resolveProjectRoot } from './resolve-root';
import { registerComponentsTools } from './tools/components/index';
import { registerDatabaseTools } from './tools/database/index';
import { registerKitDbTools } from './tools/db/index';
import { registerKitDevTools } from './tools/dev/index';
import { registerKitEmailTemplatesTools } from './tools/emails/index';
import { registerKitEnvTools } from './tools/env/index';
import { registerKitEmailsTools } from './tools/mailbox/index';
import { registerGetMigrationsTools } from './tools/migrations/index';
import { registerPRDTools } from './tools/prd-manager/index';
import { registerKitPrerequisitesTool } from './tools/prerequisites/index';
import { registerPromptsSystem } from './tools/prompts/index';
import { registerRepoChecksTools } from './tools/run-checks/index';
import { registerKitStatusTool } from './tools/status/index';
import { registerKitTranslationsTools } from './tools/translations/index';

async function main() {
  const server = new McpServer({
    name: 'makerkit',
    version: '1.0.0',
  });

  const transport = new StdioServerTransport();
  const rootPath = resolveProjectRoot();

  registerGetMigrationsTools(server, rootPath);
  registerKitStatusTool(server, rootPath);
  registerKitPrerequisitesTool(server, rootPath);
  registerKitEnvTools(server, rootPath);
  registerKitDevTools(server, rootPath);
  registerKitDbTools(server, rootPath);
  registerKitEmailsTools(server, rootPath);
  registerKitEmailTemplatesTools(server, rootPath);
  registerKitTranslationsTools(server, rootPath);
  registerDatabaseTools(server, rootPath);
  registerComponentsTools(server, rootPath);
  registerRepoChecksTools(server, rootPath);
  registerPRDTools(server, rootPath);
  registerPromptsSystem(server);

  await server.connect(transport);

  console.error('Makerkit MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
