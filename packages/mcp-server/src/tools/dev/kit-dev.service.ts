import { DEFAULT_SUPABASE_PORTS } from '../../lib/supabase-config';
import type {
  DevServiceId,
  DevServiceSelection,
  DevServiceStatusItem,
  KitDevStartInput,
  KitDevStartOutput,
  KitDevStatusOutput,
  KitDevStopInput,
  KitDevStopOutput,
  KitMailboxStatusOutput,
} from './schema';

type VariantFamily = 'supabase' | 'orm';
type Framework = 'nextjs' | 'react-router';

type SignalName = 'SIGTERM' | 'SIGKILL';

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface ProcessInfo {
  pid: number;
  command: string;
}

interface SpawnedProcess {
  pid: number;
}

interface VariantContext {
  variant: string;
  variantFamily: VariantFamily;
  framework: Framework;
}

export interface PortConfig {
  appPort: number;
  supabaseApiPort: number;
  supabaseStudioPort: number;
  mailboxApiPort: number;
  mailboxPort: number;
  ormDbPort: number;
  stripeWebhookPath: string;
}

export const DEFAULT_PORT_CONFIG: PortConfig = {
  appPort: 3000,
  supabaseApiPort: DEFAULT_SUPABASE_PORTS.api,
  supabaseStudioPort: DEFAULT_SUPABASE_PORTS.studio,
  mailboxApiPort: DEFAULT_SUPABASE_PORTS.mailbox,
  mailboxPort: 8025,
  ormDbPort: 5432,
  stripeWebhookPath: '/api/billing/webhook',
};

export interface KitDevServiceDeps {
  rootPath: string;
  resolveVariantContext(): Promise<VariantContext>;
  resolvePortConfig(): Promise<PortConfig>;
  executeCommand(command: string, args: string[]): Promise<CommandResult>;
  spawnDetached(command: string, args: string[]): Promise<SpawnedProcess>;
  isPortOpen(port: number): Promise<boolean>;
  getPortProcess(port: number): Promise<ProcessInfo | null>;
  isProcessRunning(pid: number): Promise<boolean>;
  findProcessesByName(pattern: string): Promise<ProcessInfo[]>;
  killProcess(pid: number, signal?: SignalName): Promise<void>;
  sleep(ms: number): Promise<void>;
  fetchJson(url: string): Promise<unknown>;
}

interface MailboxHealth {
  connected: boolean;
  running: boolean;
  apiReachable: boolean;
  url: string;
  port: number;
  reason?: string;
  diagnostics?: Record<string, string>;
}

export function createKitDevService(deps: KitDevServiceDeps) {
  return new KitDevService(deps);
}

export class KitDevService {
  constructor(private readonly deps: KitDevServiceDeps) {}

  async start(input: KitDevStartInput): Promise<KitDevStartOutput> {
    const selectedServices = this.expandServices(input.services);
    const variant = await this.deps.resolveVariantContext();
    const ports = await this.deps.resolvePortConfig();

    const startedPids: Partial<Record<DevServiceId, number>> = {};

    if (selectedServices.includes('database')) {
      const running = await this.isDatabaseRunning(variant, ports);

      if (!running) {
        await this.startDatabase(variant);
      }
    }

    if (
      selectedServices.includes('mailbox') &&
      variant.variantFamily === 'supabase'
    ) {
      const mailbox = await this.collectMailboxHealth(variant, ports);

      if (!mailbox.connected) {
        await this.startDatabase(variant);
      }
    }

    if (selectedServices.includes('app')) {
      const running = await this.deps.isPortOpen(ports.appPort);

      if (!running) {
        startedPids.app = await this.startApp(variant, ports);
      }
    }

    if (selectedServices.includes('stripe')) {
      const procs = await this.deps.findProcessesByName('stripe.*listen');

      if (procs.length === 0) {
        startedPids.stripe = await this.startStripe(ports);
      }
    }

    const status = await this.collectStatus(variant, ports, startedPids);

    return {
      services: status.filter((service) =>
        selectedServices.includes(service.id),
      ),
    };
  }

  async stop(input: KitDevStopInput): Promise<KitDevStopOutput> {
    const selectedServices = this.expandServices(input.services);
    const variant = await this.deps.resolveVariantContext();
    const ports = await this.deps.resolvePortConfig();

    const stopped = new Set<DevServiceId>();

    if (selectedServices.includes('stripe')) {
      const procs = await this.deps.findProcessesByName('stripe.*listen');

      for (const proc of procs) {
        await this.stopProcess(proc.pid);
      }

      stopped.add('stripe');
    }

    if (selectedServices.includes('app')) {
      const proc = await this.deps.getPortProcess(ports.appPort);

      if (proc) {
        await this.stopProcess(proc.pid);
      }

      stopped.add('app');
    }

    const shouldStopDatabase =
      selectedServices.includes('database') ||
      (selectedServices.includes('mailbox') &&
        variant.variantFamily === 'supabase');

    if (shouldStopDatabase) {
      try {
        await this.stopDatabase(variant);
      } catch {
        // Best-effort — the database process may already be stopped or
        // the CLI may not be available.
      }

      if (selectedServices.includes('database')) {
        stopped.add('database');
      }
      if (selectedServices.includes('mailbox')) {
        stopped.add('mailbox');
      }
    } else if (selectedServices.includes('mailbox')) {
      stopped.add('mailbox');
    }

    return {
      stopped: Array.from(stopped),
    };
  }

  async status(): Promise<KitDevStatusOutput> {
    const variant = await this.deps.resolveVariantContext();
    const ports = await this.deps.resolvePortConfig();

    const services = await this.collectStatus(variant, ports);

    return {
      services,
    };
  }

  async mailboxStatus(): Promise<KitMailboxStatusOutput> {
    const variant = await this.deps.resolveVariantContext();
    const ports = await this.deps.resolvePortConfig();
    const mailbox = await this.collectMailboxHealth(variant, ports);

    return {
      connected: mailbox.connected,
      running: mailbox.running,
      api_reachable: mailbox.apiReachable,
      url: mailbox.url,
      port: mailbox.port,
      reason: mailbox.reason,
    };
  }

  private expandServices(services: DevServiceSelection[]): DevServiceId[] {
    if (services.includes('all')) {
      return ['app', 'database', 'mailbox', 'stripe'];
    }

    const normalized = services.map((service) =>
      service === 'mailpit' ? 'mailbox' : service,
    );

    return Array.from(new Set(normalized)) as DevServiceId[];
  }

  private async isDatabaseRunning(
    variant: VariantContext,
    ports: PortConfig,
  ): Promise<boolean> {
    if (variant.variantFamily === 'supabase') {
      const apiOpen = await this.deps.isPortOpen(ports.supabaseApiPort);
      const studioOpen = await this.deps.isPortOpen(ports.supabaseStudioPort);

      return apiOpen || studioOpen;
    }

    return this.deps.isPortOpen(ports.ormDbPort);
  }

  private async startDatabase(variant: VariantContext) {
    if (variant.variantFamily === 'supabase') {
      await this.deps.executeCommand('pnpm', [
        '--filter',
        'web',
        'supabase:start',
      ]);
      await this.deps.sleep(400);

      return;
    }

    await this.deps.executeCommand('docker', [
      'compose',
      'up',
      '-d',
      'postgres',
    ]);
  }

  private async stopDatabase(variant: VariantContext) {
    if (variant.variantFamily === 'supabase') {
      await this.deps.executeCommand('pnpm', [
        '--filter',
        'web',
        'supabase:stop',
      ]);
      return;
    }

    await this.deps.executeCommand('docker', ['compose', 'stop', 'postgres']);
  }

  private async startApp(
    variant: VariantContext,
    ports: PortConfig,
  ): Promise<number> {
    const args =
      variant.framework === 'react-router'
        ? ['exec', 'react-router', 'dev', '--port', String(ports.appPort)]
        : [
            '--filter',
            'web',
            'exec',
            'next',
            'dev',
            '--port',
            String(ports.appPort),
          ];

    const process = await this.deps.spawnDetached('pnpm', args);

    await this.deps.sleep(500);

    return process.pid;
  }

  private async startStripe(ports: PortConfig): Promise<number> {
    const webhookUrl = `http://localhost:${ports.appPort}${ports.stripeWebhookPath}`;
    const process = await this.deps.spawnDetached('pnpm', [
      'exec',
      'stripe',
      'listen',
      '--forward-to',
      webhookUrl,
    ]);

    return process.pid;
  }

  private async collectStatus(
    variant: VariantContext,
    ports: PortConfig,
    startedPids: Partial<Record<DevServiceId, number>> = {},
  ): Promise<DevServiceStatusItem[]> {
    const app = await this.collectAppStatus(variant, ports, startedPids);
    const database = await this.collectDatabaseStatus(variant, ports);
    const mailbox = await this.collectMailboxStatus(variant, ports);
    const stripe = await this.collectStripeStatus(ports, startedPids);

    return [app, database, mailbox, stripe];
  }

  private async collectAppStatus(
    variant: VariantContext,
    ports: PortConfig,
    startedPids: Partial<Record<DevServiceId, number>> = {},
  ): Promise<DevServiceStatusItem> {
    const name =
      variant.framework === 'react-router'
        ? 'React Router Dev Server'
        : 'Next.js Dev Server';

    const portOpen = await this.deps.isPortOpen(ports.appPort);
    const proc = portOpen
      ? await this.deps.getPortProcess(ports.appPort)
      : null;

    // If we just started the app, the port may not be open yet.
    // Fall back to checking if the spawned process is alive.
    const justStartedPid = startedPids.app;
    const justStartedAlive = justStartedPid
      ? await this.deps.isProcessRunning(justStartedPid)
      : false;

    const running = portOpen || justStartedAlive;

    return {
      id: 'app',
      name,
      status: running ? 'running' : 'stopped',
      port: ports.appPort,
      url: running ? `http://localhost:${ports.appPort}` : undefined,
      pid: proc?.pid ?? (justStartedAlive ? justStartedPid : null) ?? null,
    };
  }

  private async collectDatabaseStatus(
    variant: VariantContext,
    ports: PortConfig,
  ): Promise<DevServiceStatusItem> {
    if (variant.variantFamily === 'supabase') {
      const extras = await this.resolveSupabaseExtras();
      const apiPort =
        extractPortFromUrl(extras.api_url) ?? ports.supabaseApiPort;
      const studioPort =
        extractPortFromUrl(extras.studio_url) ?? ports.supabaseStudioPort;
      const portOpen = await this.deps.isPortOpen(apiPort);
      const studioOpen = await this.deps.isPortOpen(studioPort);
      const running = portOpen || studioOpen;

      return {
        id: 'database',
        name: 'Supabase',
        status: running ? 'running' : 'stopped',
        port: apiPort,
        url:
          extras.api_url ??
          (running ? `http://127.0.0.1:${apiPort}` : undefined),
        extras: running
          ? {
              ...(extras.studio_url ? { studio_url: extras.studio_url } : {}),
              ...(extras.anon_key ? { anon_key: extras.anon_key } : {}),
              ...(extras.service_role_key
                ? { service_role_key: extras.service_role_key }
                : {}),
            }
          : undefined,
      };
    }

    const running = await this.deps.isPortOpen(ports.ormDbPort);

    return {
      id: 'database',
      name: 'PostgreSQL',
      status: running ? 'running' : 'stopped',
      port: ports.ormDbPort,
      url: running ? `postgresql://localhost:${ports.ormDbPort}` : undefined,
    };
  }

  private async collectStripeStatus(
    ports: PortConfig,
    startedPids: Partial<Record<DevServiceId, number>> = {},
  ): Promise<DevServiceStatusItem> {
    const procs = await this.deps.findProcessesByName('stripe.*listen');
    const justStartedPid = startedPids.stripe;
    const justStartedAlive = justStartedPid
      ? await this.deps.isProcessRunning(justStartedPid)
      : false;

    const running = procs.length > 0 || justStartedAlive;
    const pid =
      procs[0]?.pid ?? (justStartedAlive ? justStartedPid : undefined);

    const webhookUrl = procs[0]?.command
      ? (extractForwardToUrl(procs[0].command) ??
        `http://localhost:${ports.appPort}${ports.stripeWebhookPath}`)
      : `http://localhost:${ports.appPort}${ports.stripeWebhookPath}`;

    return {
      id: 'stripe',
      name: 'Stripe CLI',
      status: running ? 'running' : 'stopped',
      pid: pid ?? null,
      webhook_url: running ? webhookUrl : undefined,
    };
  }

  private async collectMailboxStatus(
    variant: VariantContext,
    ports: PortConfig,
  ): Promise<DevServiceStatusItem> {
    const mailbox = await this.collectMailboxHealth(variant, ports);

    return {
      id: 'mailbox',
      name: 'Mailbox',
      status: mailbox.running
        ? 'running'
        : mailbox.connected && !mailbox.apiReachable
          ? 'error'
          : 'stopped',
      port: mailbox.port,
      url: mailbox.url,
      extras: mailbox.diagnostics,
    };
  }

  private async collectMailboxHealth(
    variant: VariantContext,
    ports: PortConfig,
  ): Promise<MailboxHealth> {
    const mailboxUrl = `http://localhost:${ports.mailboxPort}`;
    const mailboxApiUrl = `http://127.0.0.1:${ports.mailboxApiPort}/api/v1/info`;

    if (variant.variantFamily !== 'supabase') {
      return {
        connected: false,
        running: false,
        apiReachable: false,
        url: mailboxUrl,
        port: ports.mailboxPort,
        reason: 'Mailbox is only available for Supabase variants',
      };
    }

    const [apiReachable, containerStatus] = await Promise.all([
      this.checkMailboxApi(mailboxApiUrl),
      this.resolveMailboxContainerStatus(),
    ]);

    if (apiReachable.ok) {
      return {
        connected: true,
        running: true,
        apiReachable: true,
        url: mailboxUrl,
        port: ports.mailboxPort,
      };
    }

    if (containerStatus.running) {
      const reason =
        'Mailbox container is running, but Mailpit API is unreachable';

      return {
        connected: true,
        running: false,
        apiReachable: false,
        url: mailboxUrl,
        port: ports.mailboxPort,
        reason,
        diagnostics: {
          reason,
          api_url: mailboxApiUrl,
          ...(apiReachable.error ? { api_error: apiReachable.error } : {}),
          ...(containerStatus.source
            ? { container_source: containerStatus.source }
            : {}),
          ...(containerStatus.details
            ? { container_details: containerStatus.details }
            : {}),
        },
      };
    }

    return {
      connected: false,
      running: false,
      apiReachable: false,
      url: mailboxUrl,
      port: ports.mailboxPort,
      reason: 'Mailbox is not running',
      diagnostics: {
        reason: 'Mailbox is not running',
        api_url: mailboxApiUrl,
        ...(apiReachable.error ? { api_error: apiReachable.error } : {}),
        ...(containerStatus.details
          ? { container_details: containerStatus.details }
          : {}),
      },
    };
  }

  private async resolveMailboxContainerStatus(): Promise<{
    running: boolean;
    source?: string;
    details?: string;
  }> {
    const dockerComposeResult = await this.tryGetRunningServicesFromCommand(
      'docker',
      [
        'compose',
        '-f',
        'docker-compose.dev.yml',
        'ps',
        '--status',
        'running',
        '--services',
      ],
      'docker-compose.dev.yml',
    );

    if (dockerComposeResult.running) {
      return dockerComposeResult;
    }

    const supabaseDockerResult = await this.tryGetRunningServicesFromCommand(
      'docker',
      ['ps', '--format', '{{.Names}}'],
      'docker ps',
    );

    return supabaseDockerResult;
  }

  private async tryGetRunningServicesFromCommand(
    command: string,
    args: string[],
    source: string,
  ): Promise<{ running: boolean; source?: string; details?: string }> {
    try {
      const result = await this.deps.executeCommand(command, args);
      const serviceLines = result.stdout
        .split('\n')
        .map((line) => line.trim().toLowerCase())
        .filter(Boolean);
      const running = serviceLines.some((line) =>
        /(mailpit|inbucket)/.test(line),
      );

      return {
        running,
        source,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      return {
        running: false,
        source,
        details: message,
      };
    }
  }

  private async checkMailboxApi(url: string): Promise<{
    ok: boolean;
    error?: string;
  }> {
    try {
      await this.deps.fetchJson(url);

      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async resolveSupabaseExtras() {
    try {
      const result = await this.deps.executeCommand('pnpm', [
        '--filter',
        'web',
        'supabase',
        'status',
        '-o',
        'env',
      ]);

      return parseSupabaseEnvOutput(result.stdout);
    } catch {
      try {
        const result = await this.deps.executeCommand('pnpm', [
          '--filter',
          'web',
          'supabase:status',
        ]);

        return parseSupabaseTextOutput(result.stdout);
      } catch {
        return {
          api_url: undefined,
          studio_url: undefined,
          anon_key: undefined,
          service_role_key: undefined,
        };
      }
    }
  }

  private async stopProcess(pid: number) {
    try {
      await this.deps.killProcess(pid, 'SIGTERM');
      await this.deps.sleep(200);
      const running = await this.deps.isProcessRunning(pid);

      if (running) {
        await this.deps.killProcess(pid, 'SIGKILL');
      }
    } catch {
      // noop - process may already be dead.
    }
  }
}

function parseSupabaseEnvOutput(output: string) {
  const values: Record<string, string> = {};

  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const idx = trimmed.indexOf('=');
    if (idx <= 0) {
      continue;
    }

    const key = trimmed.slice(0, idx).trim();
    // Newer Supabase CLIs quote the values: API_URL="http://..."
    const value = trimmed
      .slice(idx + 1)
      .trim()
      .replace(/^(["'])(.*)\1$/, '$2');

    if (key) {
      values[key] = value;
    }
  }

  return {
    api_url: values.API_URL,
    studio_url: values.STUDIO_URL,
    anon_key: values.ANON_KEY,
    service_role_key: values.SERVICE_ROLE_KEY,
  };
}

function extractPortFromUrl(url: string | undefined): number | undefined {
  if (!url) {
    return undefined;
  }

  try {
    const parsed = new URL(url);
    const port = Number(parsed.port);

    return Number.isFinite(port) && port > 0 ? port : undefined;
  } catch {
    return undefined;
  }
}

function parseSupabaseTextOutput(output: string) {
  const findValue = (label: string) => {
    const regex = new RegExp(`${label}\\s*:\\s*(.+)`);
    const match = output.match(regex);
    return match?.[1]?.trim();
  };

  return {
    api_url: findValue('API URL'),
    studio_url: findValue('Studio URL'),
    anon_key: findValue('anon key'),
    service_role_key: findValue('service_role key'),
  };
}

function extractForwardToUrl(command: string): string | undefined {
  const match = command.match(/--forward-to\s+(\S+)/);
  return match?.[1];
}
