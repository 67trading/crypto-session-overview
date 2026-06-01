import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSessionOverviewRouter } from '../src/router.js';
import type { SessionOverviewService } from '../../service/src/session-overview.service.js';

const validBody = {
  session: 'US_CRYPTO',
  symbols: { core: ['BTCUSDT', 'ETHUSDT'], major: [], watch: [] },
  publish: false,
};

const servers: Array<{ close: (cb?: (err?: Error) => void) => void }> = [];

function makeService(): SessionOverviewService {
  return {
    runSessionOverview: vi.fn().mockResolvedValue({
      overviewId: 'overview-1',
      status: 'SUCCESS',
      durationMs: 123,
      telegramPublished: false,
      marketRegime: 'mixed',
      briefConfidence: 'medium',
      collectorStatus: { 'market-data': 'success' },
    }),
    listOverviews: vi.fn().mockResolvedValue([]),
    getLatestOverview: vi.fn().mockResolvedValue(null),
    getOverviewById: vi.fn().mockResolvedValue(null),
    listEvents: vi.fn().mockResolvedValue([]),
    listCollectorRuns: vi.fn().mockResolvedValue([]),
    listTelegramPosts: vi.fn().mockResolvedValue([]),
  } as unknown as SessionOverviewService;
}

async function startTestServer(service: SessionOverviewService, options: Parameters<typeof createSessionOverviewRouter>[1]) {
  const app = express();
  app.use(express.json());
  app.use(createSessionOverviewRouter(service, options));
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

describe('POST /overviews/trigger auth and rate limit', () => {
  it('returns 401 when bearer token is missing', async () => {
    const service = makeService();
    const baseUrl = await startTestServer(service, { apiToken: 'secret' });

    const response = await fetch(`${baseUrl}/overviews/trigger`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validBody),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'UNAUTHORIZED' });
    expect(service.runSessionOverview).not.toHaveBeenCalled();
  });

  it('returns 403 when bearer token is invalid', async () => {
    const service = makeService();
    const baseUrl = await startTestServer(service, { apiToken: 'secret' });

    const response = await fetch(`${baseUrl}/overviews/trigger`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer wrong' },
      body: JSON.stringify(validBody),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'FORBIDDEN' });
    expect(service.runSessionOverview).not.toHaveBeenCalled();
  });

  it('returns 202 and forwards force when bearer token is valid', async () => {
    const service = makeService();
    const baseUrl = await startTestServer(service, { apiToken: 'secret' });

    const response = await fetch(`${baseUrl}/overviews/trigger`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer secret' },
      body: JSON.stringify({ ...validBody, force: true }),
    });

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      overviewId: 'overview-1',
      status: 'SUCCESS',
      collectorStatus: { 'market-data': 'success' },
    });
    expect(service.runSessionOverview).toHaveBeenCalledWith(expect.objectContaining({ force: true }));
  });

  it('returns 429 after trigger rate limit is exceeded', async () => {
    const service = makeService();
    const baseUrl = await startTestServer(service, {
      apiToken: 'secret',
      rateLimit: { maxRequests: 1, windowMs: 60_000 },
    });

    const request = () => fetch(`${baseUrl}/overviews/trigger`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer secret' },
      body: JSON.stringify(validBody),
    });

    expect((await request()).status).toBe(202);
    const second = await request();

    expect(second.status).toBe(429);
    expect(await second.json()).toMatchObject({ code: 'RATE_LIMITED' });
    expect(service.runSessionOverview).toHaveBeenCalledTimes(1);
  });

  it('rejects force=true without auth configuration', async () => {
    const service = makeService();
    const baseUrl = await startTestServer(service, {});

    const response = await fetch(`${baseUrl}/overviews/trigger`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...validBody, force: true }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'FORCE_REQUIRES_AUTH' });
    expect(service.runSessionOverview).not.toHaveBeenCalled();
  });
});
