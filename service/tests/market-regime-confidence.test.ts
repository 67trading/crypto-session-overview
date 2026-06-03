import { describe, it, expect } from 'vitest';
import { computeReportConfidence } from '../src/market-regime-confidence.js';
import type { AltsBreadthSummary, CrossMarketSummary, DerivativesNarrativeSummary, PrecomputedEvents, PrecomputedRegime } from '../src/ports.js';

const regime: PrecomputedRegime = {
  marketRegime: 'short_heavy_near_support',
  briefConfidence: 'high',
};

const alts: AltsBreadthSummary = {
  breadthPercent: 83,
  positiveCount: 5,
  totalTracked: 6,
  breadthLabel: '83% of 6 tracked alts positive on 24h',
  rotationState: 'broad_rotation',
  sourceScope: 'tracked_basket',
};

const crossMarket: CrossMarketSummary = {
  ethBtcTrendLabel: 'ETH/BTC rising — ETH gaining vs BTC (+3.1% over 7d)',
  ethHeaderLabel: 'ETH/BTC 7d resilience, USD weak',
  ethBtc7dChangePct: 3.1,
  ethUsd24hChangePct: -5.1,
  ethUsd24hLabel: 'weak',
  dominanceSignal: 'falling',
  dominanceLabel: 'BTC dominance likely falling',
  topOutperformers: [],
  topUnderperformers: [],
};

const events: PrecomputedEvents = {
  upcomingEvents: [{
    title: 'Delisting',
    time: '2026-06-03T08:00:00.000Z',
    importance: 'high',
    displayTimeType: 'publishedAt',
    verificationStatus: 'ambiguous',
  }],
  totalDeduped: 0,
  sessionFiltered: 1,
  hasCritical: false,
};

const btcLevels = {
  weekly: {
    currentWeekOpen: 70000,
    previousWeekHigh: 78000,
    previousWeekLow: 65000,
    previousWeekClose: 67000,
    weeklyMidpoint: 71500,
    weeklyPosition: 'below_midpoint' as const,
  },
  daily: {
    currentDayOpen: 66754.8,
    previousDayHigh: 71400,
    previousDayLow: 65412,
    previousDayClose: 66900,
    dailyMidpoint: 68806.95,
    dailyPosition: 'below_midpoint' as const,
  },
  fourHour: {
    structure: 'bearish' as const,
    lastSwingHigh: 74225.4,
    lastSwingLow: 65412,
    supportZone: { low: 65412, high: 66000 },
    resistanceZone: { low: 70000, high: 74225.4 },
  },
};

describe('computeReportConfidence()', () => {
  it('caps clear BTC reads at medium when derivatives are source-scoped and metadata is ambiguous', () => {
    const derivatives: DerivativesNarrativeSummary = {
      funding: 'neutral across BTC/ETH',
      oi: 'stable across BTC/ETH',
      positioning: 'balanced across BTC/ETH',
      sourceScope: 'single_venue',
      verificationStatus: 'source_scoped',
    };

    const result = computeReportConfidence({
      precomputedRegime: regime,
      dataStatus: { price: 'fresh', events: 'fresh', derivatives: 'fresh', liquidations: 'unavailable' },
      btcLevels,
      derivativesNarrative: derivatives,
      altsBreadth: alts,
      crossMarket,
      events,
      options: [{ symbol: 'BTC', maxPainStrike: 75000, expiryScope: 'unknown' }],
    });

    expect(result.label).toBe('medium');
    expect(result.reasons.join(' ')).toContain('source-scoped');
    expect(result.reasons.join(' ')).toContain('expiry scope');
  });

  it('allows high confidence when coverage, agreement, options, and event metadata are complete', () => {
    const derivatives: DerivativesNarrativeSummary = {
      funding: 'neutral on 3/3 venues',
      oi: 'stable on 3/3 venues',
      positioning: 'no venue-confirmed stress signal',
      sourceScope: 'cross_venue',
      verificationStatus: 'confirmed_cross_venue',
    };

    const result = computeReportConfidence({
      precomputedRegime: regime,
      dataStatus: { price: 'fresh', events: 'fresh', derivatives: 'fresh', liquidations: 'unavailable' },
      btcLevels,
      derivativesNarrative: derivatives,
      altsBreadth: { ...alts, sourceScope: 'market_wide', rotationState: 'selective_rotation' },
      crossMarket: { ...crossMarket, ethUsd24hLabel: 'neutral', ethUsd24hChangePct: 0 },
      events: {
        ...events,
        upcomingEvents: [{
          title: 'Delisting',
          time: '2026-06-10T08:00:00.000Z',
          importance: 'high',
          displayTimeType: 'tradingEndsAt',
          verificationStatus: 'confirmed_single_source',
        }],
      },
      options: [{
        symbol: 'BTC',
        maxPainStrike: 75000,
        expiryScope: 'front_expiry',
        selectedMaxPain: { expiryDate: '07JUN26', maxPain: 75000, instrumentsIncluded: 10 },
      }],
    });

    expect(result.label).toBe('high');
  });

  it('adds a soft penalty for published-only event timestamps', () => {
    const derivatives: DerivativesNarrativeSummary = {
      funding: 'neutral on 3/3 venues',
      oi: 'stable on 3/3 venues',
      positioning: 'no venue-confirmed stress signal',
      sourceScope: 'cross_venue',
      verificationStatus: 'confirmed_cross_venue',
    };

    const result = computeReportConfidence({
      precomputedRegime: regime,
      dataStatus: { price: 'fresh', events: 'fresh', derivatives: 'fresh', liquidations: 'unavailable' },
      btcLevels,
      derivativesNarrative: derivatives,
      altsBreadth: { ...alts, sourceScope: 'market_wide', rotationState: 'selective_rotation' },
      crossMarket: { ...crossMarket, ethUsd24hLabel: 'neutral', ethUsd24hChangePct: 0 },
      events: {
        ...events,
        upcomingEvents: [{
          title: 'Delisting',
          time: '2026-06-03T08:00:00.000Z',
          importance: 'high',
          displayTimeType: 'publishedAt',
          verificationStatus: 'confirmed_single_source',
        }],
      },
      options: [{
        symbol: 'BTC',
        maxPainStrike: 75000,
        expiryScope: 'front_expiry',
        selectedMaxPain: { expiryDate: '07JUN26', maxPain: 75000, instrumentsIncluded: 10 },
      }],
    });

    expect(result.ambiguityPenalty).toBeGreaterThan(0);
    expect(result.reasons.join(' ')).toContain('announced time');
  });
});
