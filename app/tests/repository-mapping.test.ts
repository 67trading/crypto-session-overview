import { describe, expect, it } from 'vitest';
import { PrismaSessionOverviewRepository } from '../src/repository.js';

describe('PrismaSessionOverviewRepository overview mapping', () => {
  it('maps sourceHealthJson and dataStatusJson back to API overview records', () => {
    const repo = new PrismaSessionOverviewRepository('postgresql://user:pass@localhost:5432/test');
    const row = {
      id: 'overview-1',
      session: 'US_CRYPTO',
      status: 'SUCCESS',
      outputJson: JSON.stringify({
        briefId: 'brief-1',
        generatedAtUtc: '2026-06-01T00:00:00Z',
        session: 'US_CRYPTO',
        marketRegime: 'mixed',
        briefConfidence: 'medium',
        dataStatus: { price: 'fresh', events: 'partial', derivatives: 'fresh', liquidations: 'unavailable' },
        whatChanged: ['Initial reading.'],
        btc: { summary: 'BTC mixed.', keyLevels: [], position: 'range', structure: 'range' },
        eth: { summary: 'ETH mixed.', vsbtc: 'flat', keyLevels: [] },
        majorAssets: [],
        alts: { summary: 'Alts mixed.', rotationState: 'unknown', breadth: 'data unavailable' },
        derivatives: { summary: 'Neutral.', funding: 'neutral', oi: 'stable', positioning: 'balanced' },
        liquidity: { bullets: ['No confirmed liquidity cluster data available.'] },
        events: { summary: 'Light calendar.', upcoming: [] },
        scenarios: { reclaim: 'Upside.', rejection: 'Downside.', chop: 'Range.' },
        note: 'Data quality normal.',
      }),
      humanReport: null,
      inputSnapshotId: null,
      telegramPostIds: '[]',
      promptVersion: null,
      model: null,
      sourceHealthJson: JSON.stringify({
        collectors: [{
          name: 'fred-rates',
          source: 'fred-rates',
          status: 'partial',
          itemCount: 2,
          reasonCode: 'ACCESS_LIMITED_QUOTA',
        }],
        healthyCount: 0,
        partialCount: 1,
        failedCount: 0,
        skippedCount: 0,
      }),
      dataStatusJson: JSON.stringify({ price: 'fresh', events: 'partial', derivatives: 'fresh', liquidations: 'unavailable' }),
      sessionWindowStart: null,
      sessionWindowEnd: null,
      runKey: null,
      createdAt: new Date('2026-06-01T00:00:00Z'),
    };

    const record = (repo as unknown as {
      toOverviewRecord(input: typeof row): {
        sourceHealth?: unknown;
        dataStatus?: unknown;
      };
    }).toOverviewRecord(row);

    expect(record.sourceHealth).toEqual(expect.objectContaining({
      partialCount: 1,
      collectors: [expect.objectContaining({
        name: 'fred-rates',
        reasonCode: 'ACCESS_LIMITED_QUOTA',
      })],
    }));
    expect(record.dataStatus).toEqual({
      price: 'fresh',
      events: 'partial',
      derivatives: 'fresh',
      liquidations: 'unavailable',
    });
  });
});
