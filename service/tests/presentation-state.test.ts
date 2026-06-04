import { describe, expect, it } from 'vitest';
import {
  buildAltsPresentation,
  buildDerivativesPresentation,
  formatConfidenceReason,
  formatDerivativesOi,
  formatEventDetailForTitle,
  formatEventTitleForTelegram,
} from '../src/presentation-state.js';
import { PRODUCT_FOOTER_NOTE } from '../src/presentation-contract.js';
import type { OverviewOutput } from '../src/ports.js';

type TestOverviewOutput = OverviewOutput & { coverage?: { summary: string } };
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T[K] extends object
    ? DeepPartial<T[K]>
    : T[K];
};

function makeOutput(overrides: DeepPartial<TestOverviewOutput> = {}): TestOverviewOutput {
  const base: OverviewOutput = {
    briefId: 'brief-ASIA_CRYPTO-1716000000000',
    generatedAtUtc: '2026-06-04T09:00:00.000Z',
    session: 'ASIA_CRYPTO',
    marketRegime: 'constructive_but_extended',
    briefConfidence: 'medium',
    dataStatus: {
      price: 'fresh',
      events: 'partial',
      derivatives: 'fresh',
      liquidations: 'unavailable',
    },
    whatChanged: ['Initial reading.'],
    btc: {
      summary: 'BTC is constructive.',
      keyLevels: ['70000'],
      position: 'above daily midpoint',
      structure: 'bullish',
    },
    eth: {
      summary: 'ETH context limited.',
      vsbtc: 'flat',
      keyLevels: ['2000'],
    },
    majorAssets: [],
    alts: {
      summary: 'Broad alt perp tape is mixed.',
      rotationState: 'selective_rotation',
      breadth: '53% of 74 liquid alt perps positive on 24h',
      sourceScope: 'broad_alt_perp_tape',
      canRenderBroadLabel: true,
    },
    derivatives: {
      summary: '',
      funding: 'neutral on 3/3 venues',
      oi: 'neutral on 3/3 venues',
      positioning: 'balanced cross-venue',
      sourceScope: 'cross_venue',
      verificationStatus: 'confirmed_cross_venue',
    },
    liquidity: {
      bullets: [],
    },
    events: {
      summary: '',
      upcoming: [],
    },
    scenarios: {
      reclaim: 'BTC reclaims resistance.',
      rejection: 'BTC rejects resistance.',
      chop: 'BTC compresses.',
    },
    note: PRODUCT_FOOTER_NOTE,
  };

  return {
    ...base,
    ...overrides,
    btc: { ...base.btc, ...overrides.btc } as OverviewOutput['btc'],
    eth: { ...base.eth, ...overrides.eth } as OverviewOutput['eth'],
    alts: { ...base.alts, ...overrides.alts } as OverviewOutput['alts'],
    derivatives: { ...base.derivatives, ...overrides.derivatives } as OverviewOutput['derivatives'],
    liquidity: { ...base.liquidity, ...overrides.liquidity } as OverviewOutput['liquidity'],
    events: { ...base.events, ...overrides.events } as OverviewOutput['events'],
    scenarios: { ...base.scenarios, ...overrides.scenarios } as OverviewOutput['scenarios'],
  } as TestOverviewOutput;
}

describe('presentation-state alts matrix', () => {
  it('maps broad alt perp breadth bands to deterministic labels', () => {
    expect(buildAltsPresentation(makeOutput({
      alts: { breadth: '10% of 74 liquid alt perps positive on 24h' },
    })).header).toBe('broad perp weakness');

    expect(buildAltsPresentation(makeOutput({
      alts: { breadth: '50% of 74 liquid alt perps positive on 24h' },
    })).header).toBe('mixed');

    expect(buildAltsPresentation(makeOutput({
      alts: { breadth: '70% of 74 liquid alt perps positive on 24h' },
    })).header).toBe('broad rotation');
  });

  it('never renders tracked-basket breadth as broad rotation', () => {
    const labels = buildAltsPresentation(makeOutput({
      alts: {
        rotationState: 'broad_rotation',
        breadth: '83% of 6 tracked alts positive on 24h',
        sourceScope: 'tracked_basket',
      },
    }));

    expect(labels.header).toBe('unavailable');
    expect(labels.rotation).toBe('unavailable');
  });
});

describe('presentation-state derivatives matrix', () => {
  it('labels confirmed neutral cross-venue derivatives only when coverage is confirmed', () => {
    expect(buildDerivativesPresentation(makeOutput()).header).toBe('cross-venue neutral');
  });

  it('labels incomplete cross-venue OI without overclaiming neutral stability', () => {
    const labels = buildDerivativesPresentation(makeOutput({
      derivatives: {
        oi: 'neutral on 1/3 venues; OI present without change window on OKX',
        verificationStatus: 'source_scoped',
      },
    }));

    expect(labels).toEqual({ marker: '🟡', header: 'funding confirmed, OI incomplete' });
    expect(formatDerivativesOi('neutral on 1/3 venues; OI present without change window on OKX'))
      .toBe('neutral on 1/3 venues; OKX has present OI only, no change window');
  });

  it('labels mixed derivatives separately from incomplete-neutral coverage', () => {
    expect(buildDerivativesPresentation(makeOutput({
      derivatives: {
        oi: 'bybit neutral, binance bearish, okx unavailable',
        positioning: 'mixed cross-venue',
        verificationStatus: 'ambiguous',
      },
    }))).toEqual({ marker: '🟡', header: 'mixed derivatives' });
  });

  it('labels leverage building, short pressure, deleveraging and source-scoped states', () => {
    expect(buildDerivativesPresentation(makeOutput({
      derivatives: { funding: 'positive elevated on 3/3 venues', oi: 'rising on 3/3 venues' },
    })).header).toBe('leverage building');

    expect(buildDerivativesPresentation(makeOutput({
      derivatives: { funding: 'negative funding on 3/3 venues', oi: 'rising on 3/3 venues' },
    })).header).toBe('short pressure building');

    expect(buildDerivativesPresentation(makeOutput({
      derivatives: { funding: 'neutral on 3/3 venues', oi: 'falling on 3/3 venues' },
    })).header).toBe('deleveraging');

    expect(buildDerivativesPresentation(makeOutput({
      derivatives: { sourceScope: 'single_venue', verificationStatus: 'confirmed_single_source' },
    })).header).toBe('source-scoped');
  });
});

describe('presentation-state confidence matrix', () => {
  it('prioritizes price coverage before other confidence reasons', () => {
    expect(formatConfidenceReason(makeOutput({
      coverage: { summary: 'Core price 1/3 · Funding 3/3 · OI 3/3' },
      confidenceBreakdown: { signalClarity: 0.8, dataCoverage: 0.4, venueAgreement: 0.3, ambiguityPenalty: 0.2, finalScore: 0.5, label: 'medium', reasons: ['fallback'] },
    }))).toBe('Core price coverage is incomplete, so confidence is capped.');
  });

  it('explains mixed/incomplete OI coverage', () => {
    expect(formatConfidenceReason(makeOutput({
      derivatives: {
        oi: 'bybit neutral, binance bearish, okx unavailable',
        positioning: 'mixed cross-venue',
        verificationStatus: 'ambiguous',
      },
    }))).toBe('Funding confirms across venues, but OI trend is mixed/incomplete.');
  });

  it('explains event timing, options scope, ETH conflict and full confirmation', () => {
    expect(formatConfidenceReason(makeOutput({
      events: { upcoming: [{ title: 'Delisting of ELON and VINU', time: '2026-06-03T08:00:01.000Z', importance: 'high', displayTimeType: 'publishedAt' }] },
    }))).toBe('Event timing is announcement-only, so confidence is capped.');

    expect(formatConfidenceReason(makeOutput({
      liquidity: { largerUpsideMagnet: 'Options ref: 75000 max pain · expiry scope unclear', bullets: [] },
    }))).toBe('Options expiry scope is unclear, so confidence is capped.');

    expect(formatConfidenceReason(makeOutput({
      eth: { headerLabel: 'ETH/BTC 7d resilience', vsbtc: 'ETH/BTC rising', ethUsd24hLabel: 'weak' },
    }))).toBe('ETH/BTC resilience conflicts with ETH/USD weakness, so confidence remains medium.');

    expect(formatConfidenceReason(makeOutput({
      briefConfidence: 'high',
      coverage: { summary: 'Core price 3/3 · Funding 3/3 · OI 3/3' },
    }))).toBe('Core price and derivatives confirm across venues.');
  });
});

describe('presentation-state event polish', () => {
  it('formats listing and delisting event titles/details without leverage overclaim', () => {
    expect(formatEventTitleForTelegram('New listing: NOWUSDT Perpetual Contract, with up to 10x leverage'))
      .toBe('New listing: NOWUSDT Perpetual Contract');
    expect(formatEventDetailForTitle('Effective time not parsed.', 'New listing: NOWUSDT Perpetual Contract'))
      .toBe('Trading start/effective time not parsed.');
    expect(formatEventDetailForTitle('Effective time not parsed.', 'Delisting of ELON and VINU'))
      .toBe('Trading-end/effective time not parsed.');
  });
});
