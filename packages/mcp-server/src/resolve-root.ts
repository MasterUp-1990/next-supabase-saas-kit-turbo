import { findWorkspaceRoot as findRoot } from '@makerkit/env-inspector/node';

export function resolveProjectRoot(argv: string[] = process.argv): string {
  // 1. CLI flag: --root /path
  const rootIdx = argv.indexOf('--root');

  const explicitRoot = rootIdx !== -1 ? argv[rootIdx + 1] : undefined;

  if (explicitRoot) {
    return explicitRoot;
  }

  // 2. Env var
  if (process.env.MAKERKIT_PROJECT_ROOT) {
    return process.env.MAKERKIT_PROJECT_ROOT;
  }

  // 3. Auto-discovery (traverse up from cwd looking for pnpm-workspace.yaml)
  return findWorkspaceRoot(process.cwd());
}

/** The nearest directory above `startPath` with a pnpm-workspace.yaml. */
export function findWorkspaceRoot(startPath: string) {
  return findRoot(startPath, { markers: ['pnpm-workspace.yaml'] });
}
