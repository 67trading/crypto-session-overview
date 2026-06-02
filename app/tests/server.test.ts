import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from '../src/server.js';
import type { AppConfig } from '../src/config.js';
import type { SessionOverviewService } from '../../service/src/session-overview.service.js';

const servers: Array<{ close: (cb?: (err?: Error) => void) => void }> = [];

function makeConfig(): AppConfig {
  return {
    bybit: { baseUrl: 'https://api.bybit.com' },
    gemini: { apiKey: 'test', model: 'gemini-test' },
    telegram: { botToken: '', chatId: '', enabled: false },
    symbols: { core: ['BTCUSDT', 'ETHUSDT'], major: [], watch: [] },
    database: { url: 'postgresql://user:pass@localhost:5432/test' },
    server: {
      port: 0,
      apiToken: 'secret',
      triggerRateLimit: { maxRequests: 1, windowMs: 60_000 },
    },
    scheduler: {
      enabled: false,
      timezone: 'UTC',
      cronAsia: '30 1 * * *',
      cronEurope: '30 8 * * *',
      cronUs: '0 15 * * *',
    },
  };
}

function makeService(): SessionOverviewService {
  return {
    runSessionOverview: vi.fn().mockResolvedValue({
      overviewId: 'overview-1',
      status: 'SUCCESS',
      durationMs: 123,
      telegramPublished: false,
      collectorStatus: {},
    }),
    listOverviews: vi.fn().mockResolvedValue([]),
    getLatestOverview: vi.fn().mockResolvedValue(null),
    getOverviewById: vi.fn().mockResolvedValue(null),
    listEvents: vi.fn().mockResolvedValue([]),
    listCollectorRuns: vi.fn().mockResolvedValue([]),
    listTelegramPosts: vi.fn().mockResolvedValue([]),
  } as unknown as SessionOverviewService;
}

async function startTestServer(service: SessionOverviewService, config: AppConfig) {
  const app = createServer(service, config);
  const server = app.listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Test server did not bind to a TCP port');
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((err?: Error) => err !== undefined ? reject(err) : resolve());
  })));
});

describe('createServer()', () => {
  it('passes configured trigger rate limit to the API router', async () => {
    const service = makeService();
    const baseUrl = await startTestServer(service, makeConfig());
    const body = {
      session: 'US_CRYPTO',
      symbols: { core: ['BTCUSDT', 'ETHUSDT'], major: [], watch: [] },
      publish: false,
    };
    const request = () => fetch(`${baseUrl}/api/v1/session-overview/overviews/trigger`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer secret' },
      body: JSON.stringify(body),
    });

    expect((await request()).status).toBe(202);
    expect((await request()).status).toBe(429);
    expect(service.runSessionOverview).toHaveBeenCalledTimes(1);
  });
});
