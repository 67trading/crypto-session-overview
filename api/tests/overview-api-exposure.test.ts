import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSessionOverviewRouter } from '../src/router.js';
import type { SessionOverviewService } from '../../service/src/session-overview.service.js';

const servers: Array<{ close: (cb?: (err?: Error) => void) => void }> = [];

function makeOverviewRecord() {
  return {
    id: 'overview-1',
    session: 'US_CRYPTO' as const,
    status: 'SUCCESS' as const,
    outputJson: {
      briefId: 'brief-1',
      generatedAtUtc: '2026-06-01T00:00:00Z',
      session: 'US_CRYPTO' as const,
      marketRegime: 'mixed' as const,
      briefConfidence: 'medium' as const,
      dataStatus: { price: 'fresh' as const, events: 'partial' as const, derivatives: 'fresh' as const, liquidations: 'unavailable' as const },
      whatChanged: ['Initial reading.'],
      btc: { summary: 'BTC mixed.', keyLevels: [], position: 'range', structure: 'range' as const },
      eth: { summary: 'ETH mixed.', vsbtc: 'flat', keyLevels: [] },
      majorAssets: [],
      alts: { summary: 'Alts mixed.', rotationState: 'unknown' as const, breadth: 'data unavailable' },
      derivatives: { summary: 'Neutral.', funding: 'neutral', oi: 'stable', positioning: 'balanced' },
      liquidity: { bullets: ['No confirmed liquidity cluster data available.'] },
      events: { summary: 'Light calendar.', upcoming: [] },
      scenarios: { reclaim: 'Upside.', rejection: 'Downside.', chop: 'Range.' },
      note: 'This is market context only. No entries, exits, position sizing or leverage.',
    },
    dataStatus: { price: 'fresh' as const, events: 'partial' as const, derivatives: 'fresh' as const, liquidations: 'unavailable' as const },
    sourceHealth: {
      collectors: [{
        name: 'fred-rates',
        source: 'fred-rates',
        status: 'partial' as const,
        itemCount: 2,
        reasonCode: 'ACCESS_LIMITED_QUOTA' as const,
      }],
      healthyCount: 0,
      partialCount: 1,
      failedCount: 0,
      skippedCount: 0,
    },
  };
}

function makeService(): SessionOverviewService {
  const overview = makeOverviewRecord();
  return {
    runSessionOverview: vi.fn(),
    listOverviews: vi.fn().mockResolvedValue([overview]),
    getLatestOverview: vi.fn().mockResolvedValue(overview),
    getOverviewById: vi.fn().mockResolvedValue(overview),
    listEvents: vi.fn().mockResolvedValue([]),
    listCollectorRuns: vi.fn().mockResolvedValue([]),
    listTelegramPosts: vi.fn().mockResolvedValue([]),
  } as unknown as SessionOverviewService;
}

async function startTestServer(service: SessionOverviewService) {
  const app = express();
  app.use(express.json());
  app.use(createSessionOverviewRouter(service));
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

describe('overview API source health exposure', () => {
  it('returns sourceHealth and dataStatus on latest overview responses', async () => {
    const baseUrl = await startTestServer(makeService());

    const response = await fetch(`${baseUrl}/overviews/latest/US_CRYPTO`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: 'overview-1',
      dataStatus: { price: 'fresh', events: 'partial', derivatives: 'fresh', liquidations: 'unavailable' },
      sourceHealth: {
        partialCount: 1,
        collectors: [expect.objectContaining({
          name: 'fred-rates',
          reasonCode: 'ACCESS_LIMITED_QUOTA',
        })],
      },
    });
  });
});
