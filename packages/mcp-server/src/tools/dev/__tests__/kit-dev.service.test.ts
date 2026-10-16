import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_PORT_CONFIG,
  type KitDevServiceDeps,
  createKitDevService,
} from '../kit-dev.service';

function createDeps(
  overrides: Partial<KitDevServiceDeps> = {},
): KitDevServiceDeps {
  return {
    rootPath: '/repo',
    async resolveVariantContext() {
      return {
        variant: 'next-supabase',
        variantFamily: 'supabase',
        framework: 'nextjs',
      };
    },
    async resolvePortConfig() {
      return DEFAULT_PORT_CONFIG;
    },
    async executeCommand(command: string, args: string[]) {
      if (
        command === 'pnpm' &&
        args.join(' ') === '--filter web supabase status -o env'
      ) {
        return {
          stdout:
            'API_URL=http://127.0.0.1:54321\nSTUDIO_URL=http://127.0.0.1:54323\nANON_KEY=test-anon\nSERVICE_ROLE_KEY=test-service\n',
          stderr: '',
          exitCode: 0,
        };
      }

      return {
        stdout: '',
        stderr: '',
        exitCode: 0,
      };
    },
    async spawnDetached() {
      return {
        pid: 999,
      };
    },
    async isPortOpen() {
      return false;
    },
    async getPortProcess() {
      return null;
    },
    async isProcessRunning() {
      return true;
    },
    async findProcessesByName() {
      return [];
    },
    async killProcess() {},
    async sleep() {},
    async fetchJson() {
      return { version: 'v1' };
    },
    ...overrides,
  };
}

function createOrmDeps(
  overrides: Partial<KitDevServiceDeps> = {},
): KitDevServiceDeps {
  return createDeps({
    async resolveVariantContext() {
      return {
        variant: 'next-drizzle',
        variantFamily: 'orm',
        framework: 'nextjs',
      };
    },
    ...overrides,
  });
}

describe('KitDevService', () => {
  describe('start', () => {
    it('starts all services in expected order and returns running statuses', async () => {
      const executeCalls: string[] = [];
      const spawnCalls: string[] = [];

      // Track which services have been started so ports become "open"
      // after their respective start commands.
      let supabaseStarted = false;
      let appStarted = false;

      const deps = createDeps({
        async executeCommand(command: string, args: string[]) {
          const full = `${command} ${args.join(' ')}`;
          executeCalls.push(full);

          if (full.includes('supabase:start')) {
            supabaseStarted = true;
          }

          if (full.includes('supabase status -o env')) {
            return {
              stdout:
                'API_URL=http://127.0.0.1:54321\nSTUDIO_URL=http://127.0.0.1:54323\nANON_KEY=test-anon\nSERVICE_ROLE_KEY=test-service\n',
              stderr: '',
              exitCode: 0,
            };
          }

          return { stdout: '', stderr: '', exitCode: 0 };
        },
        async spawnDetached(command: string, args: string[]) {
          const full = `${command} ${args.join(' ')}`;
          spawnCalls.push(full);

          if (full.includes('next dev')) {
            appStarted = true;
            return { pid: 111 };
          }

          return { pid: 222 };
        },
        async isPortOpen(port: number) {
          // Ports become open only after their service is started
          if ((port === 54321 || port === 54323) && supabaseStarted) {
            return true;
          }

          if (port === 3000 && appStarted) {
            return true;
          }

          return false;
        },
        async isProcessRunning() {
          return true;
        },
      });

      const service = createKitDevService(deps);
      const result = await service.start({ services: ['all'] });

      // Database should be started first (supabase:start before app/stripe spawns)
      expect(executeCalls).toEqual(
        expect.arrayContaining([expect.stringContaining('supabase:start')]),
      );

      const startIdx = executeCalls.findIndex((c) =>
        c.includes('supabase:start'),
      );

      expect(startIdx).toBeGreaterThanOrEqual(0);
      expect(spawnCalls[0]).toContain('next dev');
      expect(spawnCalls[1]).toContain('stripe listen');

      expect(result.services.find((s) => s.id === 'app')?.status).toBe(
        'running',
      );
      expect(result.services.find((s) => s.id === 'database')?.status).toBe(
        'running',
      );
      expect(result.services.find((s) => s.id === 'stripe')?.status).toBe(
        'running',
      );
      expect(result.services.find((s) => s.id === 'mailbox')?.status).toBe(
        'running',
      );
    });

    it('skips already running services when detected on port', async () => {
      const spawnCalls: string[] = [];

      const service = createKitDevService(
        createDeps({
          async isPortOpen(port: number) {
            // Port 3000 is already in use
            return port === 3000;
          },
          async getPortProcess(port: number) {
            if (port === 3000) {
              return { pid: 100, command: 'node' };
            }

            return null;
          },
          async spawnDetached(command: string, args: string[]) {
            spawnCalls.push(`${command} ${args.join(' ')}`);
            return { pid: 200 };
          },
        }),
      );

      const result = await service.start({ services: ['app'] });

      // Should not spawn a new process since the port is occupied
      expect(spawnCalls).toHaveLength(0);
      expect(result.services.find((s) => s.id === 'app')?.status).toBe(
        'running',
      );
    });

    it('skips already running stripe when process is detected', async () => {
      const spawnCalls: string[] = [];

      const service = createKitDevService(
        createDeps({
          async findProcessesByName() {
            return [
              {
                pid: 500,
                command:
                  'stripe listen --forward-to http://localhost:3000/api/billing/webhook',
              },
            ];
          },
          async spawnDetached(command: string, args: string[]) {
            spawnCalls.push(`${command} ${args.join(' ')}`);
            return { pid: 600 };
          },
        }),
      );

      const result = await service.start({ services: ['stripe'] });

      // Should not spawn a new process since stripe is already running
      expect(spawnCalls).toHaveLength(0);
      expect(result.services.find((s) => s.id === 'stripe')?.status).toBe(
        'running',
      );
    });

    it('starts only selected services when not "all"', async () => {
      const spawnCalls: string[] = [];
      const executeCalls: string[] = [];

      const service = createKitDevService(
        createDeps({
          async executeCommand(command: string, args: string[]) {
            const full = `${command} ${args.join(' ')}`;
            executeCalls.push(full);

            if (full.includes('supabase status -o env')) {
              return {
                stdout:
                  'API_URL=http://127.0.0.1:54321\nSTUDIO_URL=http://127.0.0.1:54323\nANON_KEY=test-anon\nSERVICE_ROLE_KEY=test-service\n',
                stderr: '',
                exitCode: 0,
              };
            }

            return { stdout: '', stderr: '', exitCode: 0 };
          },
          async spawnDetached(command: string, args: string[]) {
            spawnCalls.push(`${command} ${args.join(' ')}`);
            return { pid: 111 };
          },
        }),
      );

      const result = await service.start({ services: ['app'] });

      // Should only start app — no supabase:start, no stripe
      expect(executeCalls).not.toEqual(
        expect.arrayContaining([expect.stringContaining('supabase:start')]),
      );

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0]).toContain('next dev');
      expect(result.services).toHaveLength(1);
      expect(result.services[0]?.id).toBe('app');
    });

    it('starts database with docker compose for ORM variants', async () => {
      const executeCalls: string[] = [];

      const service = createKitDevService(
        createOrmDeps({
          async executeCommand(command: string, args: string[]) {
            executeCalls.push(`${command} ${args.join(' ')}`);
            return { stdout: '', stderr: '', exitCode: 0 };
          },
        }),
      );

      const result = await service.start({ services: ['database'] });

      expect(executeCalls).toEqual(
        expect.arrayContaining([
          expect.stringContaining('docker compose up -d postgres'),
        ]),
      );

      const db = result.services.find((s) => s.id === 'database');
      expect(db?.name).toBe('PostgreSQL');
    });

    it('returns Supabase extras (studio_url, anon_key, service_role_key) for supabase variants', async () => {
      let supabaseStarted = false;

      const service = createKitDevService(
        createDeps({
          async executeCommand(command: string, args: string[]) {
            const full = `${command} ${args.join(' ')}`;

            if (full.includes('supabase:start')) {
              supabaseStarted = true;
            }

            if (full.includes('supabase status -o env')) {
              return {
                stdout:
                  'API_URL=http://127.0.0.1:54321\nSTUDIO_URL=http://127.0.0.1:54323\nANON_KEY=test-anon\nSERVICE_ROLE_KEY=test-service\n',
                stderr: '',
                exitCode: 0,
              };
            }

            return { stdout: '', stderr: '', exitCode: 0 };
          },
          async isPortOpen(port: number) {
            if ((port === 54321 || port === 54323) && supabaseStarted) {
              return true;
            }

            return false;
          },
        }),
      );

      const result = await service.start({ services: ['database'] });
      const db = result.services.find((s) => s.id === 'database');

      expect(db?.extras).toBeDefined();
      expect(db?.extras?.studio_url).toBe('http://127.0.0.1:54323');
      expect(db?.extras?.anon_key).toBe('test-anon');
      expect(db?.extras?.service_role_key).toBe('test-service');
    });

    it('reports app as running via PID when port is not yet open after start', async () => {
      const service = createKitDevService(
        createDeps({
          async spawnDetached() {
            return { pid: 555 };
          },
          async isPortOpen() {
            // Port never becomes open during this test
            return false;
          },
          async isProcessRunning(pid: number) {
            // But the spawned process is alive
            return pid === 555;
          },
        }),
      );

      const result = await service.start({ services: ['app'] });
      const app = result.services.find((s) => s.id === 'app');

      expect(app?.status).toBe('running');
      expect(app?.pid).toBe(555);
    });

    it('de-duplicates service ids when specified multiple times', async () => {
      const spawnCalls: string[] = [];

      const service = createKitDevService(
        createDeps({
          async spawnDetached(command: string, args: string[]) {
            spawnCalls.push(`${command} ${args.join(' ')}`);
            return { pid: 111 };
          },
        }),
      );

      const result = await service.start({
        services: ['app', 'app'],
      });

      // Only one app spawn, not two
      const appSpawns = spawnCalls.filter((s) => s.includes('next dev'));

      expect(appSpawns).toHaveLength(1);
      expect(result.services).toHaveLength(1);
    });
  });

  describe('stop', () => {
    it('stops detected services by finding processes at runtime', async () => {
      const killProcess = vi.fn(async () => {});

      const service = createKitDevService(
        createDeps({
          async getPortProcess(port: number) {
            if (port === 3000) {
              return { pid: 123, command: 'node' };
            }

            return null;
          },
          async findProcessesByName() {
            return [
              {
                pid: 456,
                command:
                  'stripe listen --forward-to http://localhost:3000/api/billing/webhook',
              },
            ];
          },
          killProcess,
        }),
      );

      const result = await service.stop({
        services: ['app', 'stripe'],
      });

      expect(result.stopped).toEqual(expect.arrayContaining(['app', 'stripe']));
      expect(killProcess).toHaveBeenCalledWith(123, 'SIGTERM');
      expect(killProcess).toHaveBeenCalledWith(456, 'SIGTERM');
    });

    it('stops all services when "all" is specified', async () => {
      const killProcess = vi.fn(async () => {});
      const executeCalls: string[] = [];

      const service = createKitDevService(
        createDeps({
          async getPortProcess(port: number) {
            if (port === 3000) {
              return { pid: 123, command: 'node' };
            }

            return null;
          },
          async findProcessesByName() {
            return [{ pid: 456, command: 'stripe listen' }];
          },
          killProcess,
          async executeCommand(command: string, args: string[]) {
            executeCalls.push(`${command} ${args.join(' ')}`);
            return { stdout: '', stderr: '', exitCode: 0 };
          },
        }),
      );

      const result = await service.stop({ services: ['all'] });

      expect(result.stopped).toEqual(
        expect.arrayContaining(['app', 'database', 'mailbox', 'stripe']),
      );
    });

    it('stops supabase via supabase:stop for supabase variants', async () => {
      const executeCalls: string[] = [];

      const service = createKitDevService(
        createDeps({
          async executeCommand(command: string, args: string[]) {
            executeCalls.push(`${command} ${args.join(' ')}`);
            return { stdout: '', stderr: '', exitCode: 0 };
          },
        }),
      );

      await service.stop({ services: ['database'] });

      expect(executeCalls).toEqual(
        expect.arrayContaining([expect.stringContaining('supabase:stop')]),
      );
    });

    it('stops postgres via docker compose for ORM variants', async () => {
      const executeCalls: string[] = [];

      const service = createKitDevService(
        createOrmDeps({
          async executeCommand(command: string, args: string[]) {
            executeCalls.push(`${command} ${args.join(' ')}`);
            return { stdout: '', stderr: '', exitCode: 0 };
          },
        }),
      );

      await service.stop({ services: ['database'] });

      expect(executeCalls).toEqual(
        expect.arrayContaining([
          expect.stringContaining('docker compose stop postgres'),
        ]),
      );
    });

    it('sends SIGKILL if SIGTERM does not kill the process', async () => {
      let callCount = 0;

      const killProcess = vi.fn(async () => {});

      const service = createKitDevService(
        createDeps({
          async getPortProcess(port: number) {
            if (port === 3000) {
              return { pid: 123, command: 'node' };
            }

            return null;
          },
          killProcess,
          async isProcessRunning() {
            callCount++;
            // Still running after SIGTERM
            return callCount <= 2;
          },
        }),
      );

      await service.stop({ services: ['app'] });

      expect(killProcess).toHaveBeenCalledWith(123, 'SIGTERM');
      expect(killProcess).toHaveBeenCalledWith(123, 'SIGKILL');
    });

    it('succeeds even when no process is found on port', async () => {
      const service = createKitDevService(
        createDeps({
          async getPortProcess() {
            return null;
          },
        }),
      );

      const result = await service.stop({ services: ['app'] });
      expect(result.stopped).toContain('app');
    });
  });

  describe('status', () => {
    it('returns all services status', async () => {
      const service = createKitDevService(createDeps());
      const result = await service.status();

      expect(result.services).toHaveLength(4);

      const ids = result.services.map((s) => s.id);
      expect(ids).toEqual(['app', 'database', 'mailbox', 'stripe']);
    });

    it('shows running status when port is open', async () => {
      const service = createKitDevService(
        createDeps({
          async isPortOpen(port: number) {
            return port === 3000;
          },
        }),
      );

      const result = await service.status();
      const app = result.services.find((s) => s.id === 'app');

      expect(app?.status).toBe('running');
      expect(app?.url).toBe('http://localhost:3000');
    });

    it('shows stopped status when port is closed', async () => {
      const service = createKitDevService(
        createDeps({
          async isPortOpen() {
            return false;
          },
          async isProcessRunning() {
            return false;
          },
        }),
      );

      const result = await service.status();
      const app = result.services.find((s) => s.id === 'app');

      expect(app?.status).toBe('stopped');
    });

    it('returns app PID from port process when running', async () => {
      const service = createKitDevService(
        createDeps({
          async isPortOpen(port: number) {
            return port === 3000;
          },
          async getPortProcess(port: number) {
            if (port === 3000) {
              return { pid: 42, command: 'node' };
            }

            return null;
          },
        }),
      );

      const result = await service.status();
      const app = result.services.find((s) => s.id === 'app');

      expect(app?.status).toBe('running');
      expect(app?.pid).toBe(42);
    });

    it('returns Supabase extras when database is running for supabase variant', async () => {
      const service = createKitDevService(
        createDeps({
          async isPortOpen(port: number) {
            return port === 54321 || port === 54323;
          },
        }),
      );

      const result = await service.status();
      const db = result.services.find((s) => s.id === 'database');

      expect(db?.status).toBe('running');
      expect(db?.name).toBe('Supabase');
      expect(db?.extras?.anon_key).toBe('test-anon');
      expect(db?.extras?.service_role_key).toBe('test-service');
      expect(db?.extras?.studio_url).toBe('http://127.0.0.1:54323');
    });

    it('strips the quotes newer Supabase CLIs put around status -o env values', async () => {
      const service = createKitDevService(
        createDeps({
          async executeCommand(command: string, args: string[]) {
            if (args.join(' ').includes('supabase status -o env')) {
              return {
                stdout:
                  'API_URL="http://127.0.0.1:54321"\nSTUDIO_URL="http://127.0.0.1:54323"\nANON_KEY="test-anon"\nSERVICE_ROLE_KEY=\'test-service\'\n',
                stderr: '',
                exitCode: 0,
              };
            }

            return { stdout: '', stderr: '', exitCode: 0 };
          },
          async isPortOpen(port: number) {
            return port === 54321 || port === 54323;
          },
        }),
      );

      const result = await service.status();
      const db = result.services.find((s) => s.id === 'database');

      expect(db?.url).toBe('http://127.0.0.1:54321');
      expect(db?.extras).toEqual({
        studio_url: 'http://127.0.0.1:54323',
        anon_key: 'test-anon',
        service_role_key: 'test-service',
      });
    });

    it('returns PostgreSQL status for ORM variants', async () => {
      const service = createKitDevService(
        createOrmDeps({
          async isPortOpen(port: number) {
            return port === 5432;
          },
        }),
      );

      const result = await service.status();
      const db = result.services.find((s) => s.id === 'database');

      expect(db?.status).toBe('running');
      expect(db?.name).toBe('PostgreSQL');
      expect(db?.port).toBe(5432);
      expect(db?.url).toBe('postgresql://localhost:5432');
    });

    it('returns stopped database for ORM variants when port is closed', async () => {
      const service = createKitDevService(
        createOrmDeps({
          async isPortOpen() {
            return false;
          },
        }),
      );

      const result = await service.status();
      const db = result.services.find((s) => s.id === 'database');

      expect(db?.status).toBe('stopped');
      expect(db?.name).toBe('PostgreSQL');
    });

    it('returns stripe as running when process is detected', async () => {
      const service = createKitDevService(
        createDeps({
          async findProcessesByName() {
            return [
              {
                pid: 777,
                command:
                  'stripe listen --forward-to http://localhost:3000/api/billing/webhook',
              },
            ];
          },
        }),
      );

      const result = await service.status();
      const stripe = result.services.find((s) => s.id === 'stripe');

      expect(stripe?.status).toBe('running');
      expect(stripe?.pid).toBe(777);
      expect(stripe?.webhook_url).toBe(
        'http://localhost:3000/api/billing/webhook',
      );
    });

    it('extracts webhook_url from stripe process command line', async () => {
      const service = createKitDevService(
        createDeps({
          async findProcessesByName() {
            return [
              {
                pid: 777,
                command:
                  'stripe listen --forward-to http://localhost:4000/custom/webhook',
              },
            ];
          },
        }),
      );

      const result = await service.status();
      const stripe = result.services.find((s) => s.id === 'stripe');

      expect(stripe?.webhook_url).toBe('http://localhost:4000/custom/webhook');
    });

    it('returns mailbox as running only when API is reachable', async () => {
      const service = createKitDevService(
        createDeps({
          async fetchJson(url: string) {
            if (url.includes('/api/v1/info')) {
              return { name: 'mailpit' };
            }

            return {};
          },
          async executeCommand(command: string, args: string[]) {
            const full = `${command} ${args.join(' ')}`;

            if (full.includes('supabase status -o env')) {
              return {
                stdout:
                  'API_URL=http://127.0.0.1:54321\nSTUDIO_URL=http://127.0.0.1:54323\n',
                stderr: '',
                exitCode: 0,
              };
            }

            return { stdout: 'mailpit\n', stderr: '', exitCode: 0 };
          },
        }),
      );

      const result = await service.status();
      const mailbox = result.services.find((s) => s.id === 'mailbox');

      expect(mailbox?.status).toBe('running');
      expect(mailbox?.name).toBe('Mailbox');
      expect(mailbox?.port).toBe(8025);
      expect(mailbox?.url).toBe('http://localhost:8025');
    });

    it('returns mailbox error when container is running but API is unreachable', async () => {
      const service = createKitDevService(
        createDeps({
          async fetchJson() {
            throw new Error('connect ECONNREFUSED 127.0.0.1:54324');
          },
          async executeCommand(command: string, args: string[]) {
            const full = `${command} ${args.join(' ')}`;

            if (full.includes('supabase status -o env')) {
              return {
                stdout:
                  'API_URL=http://127.0.0.1:54321\nSTUDIO_URL=http://127.0.0.1:54323\n',
                stderr: '',
                exitCode: 0,
              };
            }

            return { stdout: 'mailpit\n', stderr: '', exitCode: 0 };
          },
        }),
      );

      const result = await service.status();
      const mailbox = result.services.find((s) => s.id === 'mailbox');

      expect(mailbox?.status).toBe('error');
      expect(mailbox?.extras?.reason).toContain('API is unreachable');
      expect(mailbox?.extras?.api_error).toContain('ECONNREFUSED');
    });
  });

  describe('Supabase extras parsing', () => {
    it('falls back to text output parsing when env output fails', async () => {
      let callCount = 0;

      const service = createKitDevService(
        createDeps({
          async executeCommand(command: string, args: string[]) {
            const full = `${command} ${args.join(' ')}`;

            if (full.includes('supabase status -o env')) {
              callCount++;
              throw new Error('env output not supported');
            }

            if (full.includes('supabase:status')) {
              callCount++;

              return {
                stdout: [
                  'API URL: http://127.0.0.1:54321',
                  'Studio URL: http://127.0.0.1:54323',
                  'anon key: fallback-anon',
                  'service_role key: fallback-sr',
                ].join('\n'),
                stderr: '',
                exitCode: 0,
              };
            }

            return { stdout: '', stderr: '', exitCode: 0 };
          },
          async isPortOpen(port: number) {
            return port === 54321 || port === 54323;
          },
        }),
      );

      const result = await service.status();
      const db = result.services.find((s) => s.id === 'database');

      expect(callCount).toBeGreaterThanOrEqual(2);
      expect(db?.extras?.anon_key).toBe('fallback-anon');
      expect(db?.extras?.service_role_key).toBe('fallback-sr');
    });

    it('returns empty extras when both supabase status methods fail', async () => {
      const service = createKitDevService(
        createDeps({
          async executeCommand(command: string, args: string[]) {
            const full = `${command} ${args.join(' ')}`;

            if (
              full.includes('supabase status') ||
              full.includes('supabase:status')
            ) {
              throw new Error('supabase not running');
            }

            return { stdout: '', stderr: '', exitCode: 0 };
          },
          async isPortOpen() {
            return false;
          },
        }),
      );

      const result = await service.status();
      const db = result.services.find((s) => s.id === 'database');

      expect(db?.status).toBe('stopped');
    });
  });

  describe('error propagation', () => {
    it('propagates executeCommand error when supabase:start fails', async () => {
      const service = createKitDevService(
        createDeps({
          async executeCommand(command: string, args: string[]) {
            const full = `${command} ${args.join(' ')}`;

            if (full.includes('supabase:start')) {
              throw new Error('Docker is not running');
            }

            return { stdout: '', stderr: '', exitCode: 0 };
          },
        }),
      );

      await expect(service.start({ services: ['database'] })).rejects.toThrow(
        'Docker is not running',
      );
    });

    it('propagates executeCommand error when docker compose fails for ORM', async () => {
      const service = createKitDevService(
        createOrmDeps({
          async executeCommand(command: string, args: string[]) {
            if (command === 'docker') {
              throw new Error('Cannot connect to Docker daemon');
            }

            return { stdout: '', stderr: '', exitCode: 0 };
          },
        }),
      );

      await expect(service.start({ services: ['database'] })).rejects.toThrow(
        'Cannot connect to Docker daemon',
      );
    });

    it('propagates spawnDetached error when app fails to start', async () => {
      const service = createKitDevService(
        createDeps({
          async spawnDetached() {
            throw new Error('Failed to spawn pnpm');
          },
        }),
      );

      await expect(service.start({ services: ['app'] })).rejects.toThrow(
        'Failed to spawn pnpm',
      );
    });

    it('stop succeeds even if database stop command throws', async () => {
      const service = createKitDevService(
        createDeps({
          async executeCommand() {
            throw new Error('supabase CLI not found');
          },
        }),
      );

      // Should not throw — database stop errors are caught
      const result = await service.stop({ services: ['database'] });
      expect(result.stopped).toContain('database');
    });
  });

  describe('mailbox alias and dedicated status', () => {
    it('handles mailpit alias in start and normalizes output id to mailbox', async () => {
      let supabaseStarted = false;
      const executeCalls: string[] = [];

      const service = createKitDevService(
        createDeps({
          async fetchJson() {
            if (supabaseStarted) {
              return { ok: true };
            }

            throw new Error('connect ECONNREFUSED 127.0.0.1:54324');
          },
          async executeCommand(command: string, args: string[]) {
            const full = `${command} ${args.join(' ')}`;
            executeCalls.push(full);

            if (full.includes('supabase:start')) {
              supabaseStarted = true;
            }

            if (full.includes('supabase status -o env')) {
              return {
                stdout:
                  'API_URL=http://127.0.0.1:54321\nSTUDIO_URL=http://127.0.0.1:54323\n',
                stderr: '',
                exitCode: 0,
              };
            }

            return { stdout: '', stderr: '', exitCode: 0 };
          },
        }),
      );

      const startResult = await service.start({ services: ['mailpit'] });

      expect(executeCalls).toEqual(
        expect.arrayContaining([expect.stringContaining('supabase:start')]),
      );
      expect(startResult.services).toHaveLength(1);
      expect(startResult.services[0]?.id).toBe('mailbox');
    });

    it('handles mailpit alias in stop and normalizes stopped id to mailbox', async () => {
      const executeCalls: string[] = [];

      const service = createKitDevService(
        createDeps({
          async executeCommand(command: string, args: string[]) {
            executeCalls.push(`${command} ${args.join(' ')}`);
            return { stdout: '', stderr: '', exitCode: 0 };
          },
        }),
      );

      const result = await service.stop({ services: ['mailpit'] });

      expect(executeCalls).toEqual(
        expect.arrayContaining([expect.stringContaining('supabase:stop')]),
      );
      expect(result.stopped).toContain('mailbox');
      expect(result.stopped).not.toContain('mailpit');
    });

    it('exposes graceful mailbox status for UI fallback', async () => {
      const service = createKitDevService(
        createDeps({
          async fetchJson() {
            throw new Error('connect ECONNREFUSED 127.0.0.1:54324');
          },
          async executeCommand(command: string, args: string[]) {
            const full = `${command} ${args.join(' ')}`;

            if (full.includes('supabase status -o env')) {
              return {
                stdout:
                  'API_URL=http://127.0.0.1:54321\nSTUDIO_URL=http://127.0.0.1:54323\n',
                stderr: '',
                exitCode: 0,
              };
            }

            return { stdout: 'mailpit\n', stderr: '', exitCode: 0 };
          },
        }),
      );

      const mailboxStatus = await service.mailboxStatus();

      expect(mailboxStatus).toEqual({
        connected: true,
        running: false,
        api_reachable: false,
        port: 8025,
        reason: 'Mailbox container is running, but Mailpit API is unreachable',
        url: 'http://localhost:8025',
      });
    });
  });
});
