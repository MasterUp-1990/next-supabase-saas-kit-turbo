import {
  type I18nSettings,
  type TranslationsDeps,
  type TranslationsService,
  createTranslationsService,
} from '@makerkit/i18n';
import { registerI18nTools } from '@makerkit/i18n/mcp';
import { createI18nDeps } from '@makerkit/i18n/node';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * The kit_translations_* tools come from @makerkit/i18n. The kit sets where
 * its message files live (`<messagesDir>/<locale>/<namespace>.json`).
 */
export const KIT_I18N_SETTINGS: I18nSettings = {
  messagesDir: 'apps/web/i18n/messages',
  baseLocale: 'en',
};

export function registerKitTranslationsTools(
  server: McpServer,
  rootPath?: string,
  service: TranslationsService = createKitTranslationsService(
    createKitTranslationsDeps(rootPath),
  ),
) {
  registerI18nTools(server, service, { prefix: 'kit_' });
}

export function createKitTranslationsDeps(
  rootPath = process.cwd(),
): TranslationsDeps {
  return createI18nDeps(rootPath, { settings: KIT_I18N_SETTINGS });
}

export const createKitTranslationsService = createTranslationsService;

export type KitTranslationsDeps = TranslationsDeps;

export type {
  TranslationsAddLocaleOutput as KitTranslationsAddLocaleOutput,
  TranslationsAddNamespaceOutput as KitTranslationsAddNamespaceOutput,
  TranslationsListOutput as KitTranslationsListOutput,
  TranslationsRemoveLocaleOutput as KitTranslationsRemoveLocaleOutput,
  TranslationsRemoveNamespaceOutput as KitTranslationsRemoveNamespaceOutput,
  TranslationsStatsOutput as KitTranslationsStatsOutput,
  TranslationsUpdateOutput as KitTranslationsUpdateOutput,
} from '@makerkit/i18n';
