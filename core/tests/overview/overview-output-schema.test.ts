import { describe, it, expect } from 'vitest';
import { OverviewOutputSchema } from '../../src/overview/overview-output.schema.js';

function makeValidOutput() {
  return {
    briefId: 'brief-US_CRYPTO-1716000000000',
    generatedAtUtc: '2026-05-18T20:00:00Z',
    session: 'US_CRYPTO' as const,
    marketRegime: 'constructive_but_extended' as const,
    briefConfidence: 'high' as const,
    dataStatus: {
      price: 'fresh' as const,
      events: 'partial' as const,
      derivatives: 'fresh' as const,
      liquidations: 'unavailable' as const,
    },
    whatChanged: [
      'BTC moved from 94k to 96k approaching weekly high.',
      'Funding shifted from neutral to positive elevated.',
    ],
    btc: {
      summary: 'BTC holding above daily midpoint near weekly highs.',
      keyLevels: ['97400', '95800'],
      position: 'above daily midpoint, below weekly high',
      structure: 'bullish' as const,
    },
    eth: {
      summary: 'ETH slight underperformance on 24h basis.',
      vsbtc: 'slight underperformance',
      keyLevels: ['3450'],
    },
    majorAssets: [
      { symbol: 'SOLUSDT', summary: 'Consolidating below ATH region.', keyLevels: ['185'] },
    ],
    alts: {
      summary: 'Selective rotation into large-cap alts.',
      rotationState: 'selective_rotation' as const,
      breadth: '60% of top 50 green on 24h',
    },
    derivatives: {
      summary: 'Funding elevated but not extreme.',
      funding: 'positive elevated across BTC/ETH',
      oi: 'rising slowly',
      positioning: 'long-heavy',
    },
    events: {
      summary: 'FOMC minutes later today.',
      upcoming: [
        { title: 'FOMC Minutes', time: '21:00 UTC', importance: 'critical' as const },
      ],
    },
    scenarios: {
      reclaim: 'BTC clears 97,400 — extension toward 100k.',
      rejection: 'Failure at 97,400 — retest 95,800 daily open.',
      chop: 'Range 95,800–97,400, no clean resolution.',
    },
    note: 'Liquidation cluster data unavailable — confirm with live terminal.',
  };
}

describe('OverviewOutputSchema', () => {
  it('parses a valid output without throwing', () => {
    const result = OverviewOutputSchema.parse(makeValidOutput());
    expect(result.briefId).toBe('brief-US_CRYPTO-1716000000000');
    expect(result.session).toBe('US_CRYPTO');
    expect(result.marketRegime).toBe('constructive_but_extended');
  });

  it('parses empty majorAssets and upcoming arrays', () => {
    const valid = {
      ...makeValidOutput(),
      majorAssets: [],
      events: { summary: 'No events.', upcoming: [] },
    };
    expect(() => OverviewOutputSchema.parse(valid)).not.toThrow();
  });

  it('throws when briefId is missing', () => {
    const invalid = { ...makeValidOutput(), briefId: undefined };
    expect(() => OverviewOutputSchema.parse(invalid)).toThrow();
  });

  it('throws for invalid marketRegime', () => {
    const invalid = { ...makeValidOutput(), marketRegime: 'super_bullish' };
    expect(() => OverviewOutputSchema.parse(invalid)).toThrow();
  });

  it('throws for invalid session', () => {
    const invalid = { ...makeValidOutput(), session: 'LONDON' };
    expect(() => OverviewOutputSchema.parse(invalid)).toThrow();
  });

  it('throws for invalid btc.structure', () => {
    const invalid = { ...makeValidOutput(), btc: { ...makeValidOutput().btc, structure: 'sideways' } };
    expect(() => OverviewOutputSchema.parse(invalid)).toThrow();
  });

  it('throws for invalid dataStatus value', () => {
    const invalid = {
      ...makeValidOutput(),
      dataStatus: { ...makeValidOutput().dataStatus, price: 'ok' },
    };
    expect(() => OverviewOutputSchema.parse(invalid)).toThrow();
  });

  it('throws when whatChanged is empty (min 1)', () => {
    const invalid = { ...makeValidOutput(), whatChanged: [] };
    expect(() => OverviewOutputSchema.parse(invalid)).toThrow();
  });

  it('throws when whatChanged exceeds 8 items (max 8)', () => {
    const invalid = { ...makeValidOutput(), whatChanged: Array.from({ length: 9 }, (_, i) => `item ${i}`) };
    expect(() => OverviewOutputSchema.parse(invalid)).toThrow();
  });

  it('throws when scenarios is missing reclaim field', () => {
    const invalid = {
      ...makeValidOutput(),
      scenarios: { rejection: 'test', chop: 'test' },
    };
    expect(() => OverviewOutputSchema.parse(invalid)).toThrow();
  });

  it('throws when note is missing', () => {
    const invalid = { ...makeValidOutput(), note: undefined };
    expect(() => OverviewOutputSchema.parse(invalid)).toThrow();
  });

  it('accepts all valid marketRegime values', () => {
    const regimes = [
      'risk_on_expansion', 'constructive_but_extended', 'defensive_range_bound',
      'range_compression', 'long_heavy_near_resistance', 'short_heavy_near_support',
      'risk_off', 'event_driven', 'mixed', 'unknown',
    ] as const;
    for (const regime of regimes) {
      expect(() => OverviewOutputSchema.parse({ ...makeValidOutput(), marketRegime: regime })).not.toThrow();
    }
  });

  it('accepts all valid dataStatus values', () => {
    const statuses = ['fresh', 'stale', 'partial', 'failed', 'unavailable'] as const;
    for (const s of statuses) {
      const valid = { ...makeValidOutput(), dataStatus: { price: s, events: s, derivatives: s, liquidations: s } };
      expect(() => OverviewOutputSchema.parse(valid)).not.toThrow();
    }
  });
});
