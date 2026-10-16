import type { ScriptCatalog } from '@makerkit/repo-checks';

/**
 * The script tools (get_scripts, get_script_details, get_healthcheck_scripts)
 * come from @makerkit/repo-checks and are registered with run_checks (see
 * ../run-checks). The kit adds guidance for its own root scripts: Supabase,
 * Stripe and the Oxlint/Oxfmt wording. Entries replace the package defaults
 * with the same name.
 */
export const KIT_SCRIPT_CATALOG: ScriptCatalog = {
  dev: {
    category: 'development',
    description:
      'Start development servers for all applications in parallel with hot reloading',
    usage: 'Run this to start developing. Opens web app on port 3000.',
    importance: 'medium',
  },
  build: {
    category: 'build',
    description:
      'Build all applications and packages for production deployment',
    usage:
      'Use before deploying to production. Ensures all code compiles correctly.',
    importance: 'medium',
  },
  typecheck: {
    category: 'linting',
    description:
      'Run TypeScript compiler to check for type errors across all packages',
    usage:
      'Run after writing code to ensure type safety. Must pass before commits.',
    importance: 'critical',
    healthcheck: true,
  },
  lint: {
    category: 'linting',
    description:
      'Run Oxlint to check code quality and enforce coding standards',
    usage: 'Run after writing code. Must pass before commits.',
    importance: 'critical',
    healthcheck: true,
  },
  'lint:fix': {
    category: 'linting',
    description:
      'Run Oxlint with auto-fix to automatically resolve fixable issues',
    usage: 'Use to automatically fix linting issues before manual fixes.',
    importance: 'high',
    healthcheck: true,
    mutates_files: true,
  },
  format: {
    category: 'linting',
    description: 'Check code formatting with Oxfmt across all files',
    usage: 'Verify code follows consistent formatting standards.',
    importance: 'high',
    healthcheck: true,
  },
  'format:fix': {
    category: 'linting',
    description: 'Auto-format all code with Oxfmt to ensure consistent styling',
    usage: 'Use to automatically format code before commits.',
    importance: 'high',
    healthcheck: true,
    mutates_files: true,
  },
  healthcheck: {
    category: 'linting',
    description:
      'Run lint:fix, format:fix, typecheck and manypkg fix in one go',
    usage: 'Convenience wrapper for the full verification loop. Mutates files.',
    importance: 'high',
    mutates_files: true,
  },
  test: {
    category: 'testing',
    description: 'Run all test suites across the monorepo',
    usage: 'Execute to verify functionality. Should pass before commits.',
    importance: 'high',
    healthcheck: true,
  },
  'test:unit': {
    category: 'testing',
    description: 'Run unit test suites only',
    usage: 'Faster than the full test script; use during development.',
    importance: 'medium',
  },
  'supabase:web:start': {
    category: 'database',
    description: 'Start local Supabase instance for development',
    usage: 'Required for local development with database access.',
    importance: 'critical',
  },
  'supabase:web:stop': {
    category: 'database',
    description: 'Stop the local Supabase instance',
    usage: 'Use when done developing to free up resources.',
    importance: 'medium',
  },
  'supabase:web:reset': {
    category: 'database',
    description: 'Reset local database to latest schema and seed data',
    usage: 'Destroys local data. Use when the database needs a fresh start.',
    importance: 'high',
  },
  'supabase:web:typegen': {
    category: 'database',
    description: 'Generate TypeScript types from Supabase database schema',
    usage: 'Run after database schema changes to update types.',
    importance: 'high',
  },
  'supabase:web:test': {
    category: 'testing',
    description: 'Run pgTAP database tests',
    usage: 'Test database functions, RLS policies, and migrations.',
    importance: 'high',
  },
  clean: {
    category: 'maintenance',
    description: 'Remove all generated files and dependencies',
    usage: 'Use when build artifacts are corrupted. Requires reinstall after.',
    importance: 'medium',
  },
  'clean:workspaces': {
    category: 'maintenance',
    description: 'Clean all workspace packages using Turbo',
    usage: 'Lighter cleanup that preserves node_modules.',
    importance: 'medium',
  },
  'stripe:listen': {
    category: 'development',
    description: 'Start Stripe webhook listener for local development',
    usage: 'Required when testing payment workflows locally.',
    importance: 'medium',
  },
  update: {
    category: 'maintenance',
    description: 'Update all dependencies across the monorepo',
    usage: 'Keep dependencies current. Test thoroughly after updating.',
    importance: 'low',
  },
  'syncpack:list': {
    category: 'maintenance',
    description: 'List dependency version mismatches across packages',
    usage: 'Identify inconsistent package versions in monorepo.',
    importance: 'low',
  },
  'syncpack:fix': {
    category: 'maintenance',
    description: 'Fix dependency version mismatches across packages',
    usage: 'Automatically align package versions across workspaces.',
    importance: 'low',
  },
};

export {
  createScriptsService,
  describeScript,
  type GetScriptsOutput,
  type ScriptCatalog,
  type ScriptInfo,
  type ScriptsDeps,
} from '@makerkit/repo-checks';
