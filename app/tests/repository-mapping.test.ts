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
      crossMarketJson: JSON.stringify({ ethBtcTrendLabel: 'ETH/BTC sideways', dominanceSignal: 'mixed' }),
      etfFlowJson: JSON.stringify({ btcFlowUsd: 12_000_000, date: '2026-06-01', source: 'sosovalue', sourceAvailable: true }),
      optionsJson: JSON.stringify([{ symbol: 'BTC', maxPainStrike: 75000 }]),
      sessionWindowStart: null,
      sessionWindowEnd: null,
      runKey: null,
      createdAt: new Date('2026-06-01T00:00:00Z'),
    };

    const record = (repo as unknown as {
      toOverviewRecord(input: typeof row): {
        sourceHealth?: unknown;
        dataStatus?: unknown;
        crossMarket?: unknown;
        etfFlow?: unknown;
        options?: unknown;
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
    expect(record.crossMarket).toEqual(expect.objectContaining({ ethBtcTrendLabel: 'ETH/BTC sideways' }));
    expect(record.etfFlow).toEqual(expect.objectContaining({ btcFlowUsd: 12_000_000 }));
    expect(record.options).toEqual([expect.objectContaining({ symbol: 'BTC', maxPainStrike: 75000 })]);
  });
});
