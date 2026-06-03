import { describe, it, expect } from 'vitest';
import { buildDerivativesNarrative } from '../src/derivatives-narrative-builder.js';
import type { DerivativesConsensus, DerivativesContext } from '../src/ports.js';

function makeCtx(
  funding: DerivativesContext['fundingStatus'],
  oi: DerivativesContext['oiStatus'],
  positioning: DerivativesContext['positioningStatus'],
  symbol = 'BTCUSDT',
): DerivativesContext {
  return { symbol, fundingStatus: funding, oiStatus: oi, positioningStatus: positioning };
}

describe('buildDerivativesNarrative()', () => {
  it('returns data unavailable for all fields when no contexts provided', () => {
    const result = buildDerivativesNarrative({});
    expect(result.funding).toBe('data unavailable');
    expect(result.oi).toBe('data unavailable');
    expect(result.positioning).toBe('data unavailable');
  });

  it('returns data unavailable when priority symbols are absent from contexts', () => {
    const ctx = { SOLUSDT: makeCtx('neutral', 'stable', 'balanced', 'SOLUSDT') };
    const result = buildDerivativesNarrative(ctx); // defaults to BTC/ETH
    expect(result.funding).toBe('data unavailable');
  });

  it('uses only BTC when ETH is absent', () => {
    const ctx = { BTCUSDT: makeCtx('positive_elevated', 'rising', 'long_heavy') };
    const result = buildDerivativesNarrative(ctx);
    expect(result.funding).toBe('positive elevated on BTC');
    expect(result.oi).toBe('rising on BTC');
    expect(result.positioning).toBe('long-heavy on BTC');
  });

  it('collapses same status across BTC and ETH', () => {
    const ctx = {
      BTCUSDT: makeCtx('positive_elevated', 'stable', 'balanced'),
      ETHUSDT: makeCtx('positive_elevated', 'stable', 'balanced', 'ETHUSDT'),
    };
    const result = buildDerivativesNarrative(ctx);
    expect(result.funding).toBe('positive elevated across BTC/ETH');
    expect(result.oi).toBe('stable across BTC/ETH');
    expect(result.positioning).toBe('balanced across BTC/ETH');
  });

  it('lists diverging statuses individually', () => {
    const ctx = {
      BTCUSDT: makeCtx('positive_extreme', 'rising_fast', 'long_heavy'),
      ETHUSDT: makeCtx('neutral', 'stable', 'balanced', 'ETHUSDT'),
    };
    const result = buildDerivativesNarrative(ctx);
    expect(result.funding).toBe('extreme positive (overheated) on BTC, neutral on ETH');
    expect(result.oi).toBe('rising fast on BTC, stable on ETH');
    expect(result.positioning).toBe('long-heavy on BTC, balanced on ETH');
  });

  it('skips unknown status when the other symbol has data', () => {
    const ctx = {
      BTCUSDT: makeCtx('positive_elevated', 'rising', 'long_heavy'),
      ETHUSDT: makeCtx('unknown', 'unknown', 'unknown', 'ETHUSDT'),
    };
    const result = buildDerivativesNarrative(ctx);
    expect(result.funding).toBe('positive elevated on BTC');
    expect(result.oi).toBe('rising on BTC');
    expect(result.positioning).toBe('long-heavy on BTC');
  });

  it('returns data unavailable for a field when all statuses are unknown', () => {
    const ctx = {
      BTCUSDT: makeCtx('unknown', 'stable', 'balanced'),
      ETHUSDT: makeCtx('unknown', 'stable', 'balanced', 'ETHUSDT'),
    };
    const result = buildDerivativesNarrative(ctx);
    expect(result.funding).toBe('data unavailable');
    expect(result.oi).toBe('stable across BTC/ETH');
  });

  it('maps all funding status labels correctly', () => {
    const statuses: DerivativesContext['fundingStatus'][] = [
      'negative_extreme', 'negative_elevated', 'neutral', 'positive_elevated', 'positive_extreme',
    ];
    const expected = [
      'extreme negative', 'negative elevated', 'neutral', 'positive elevated', 'extreme positive (overheated)',
    ];
    for (let i = 0; i < statuses.length; i++) {
      const ctx = { BTCUSDT: makeCtx(statuses[i]!, 'stable', 'balanced') };
      const result = buildDerivativesNarrative(ctx);
      expect(result.funding).toBe(`${expected[i]!} on BTC`);
    }
  });

  it('maps all OI status labels correctly', () => {
    const statuses: DerivativesContext['oiStatus'][] = ['falling', 'stable', 'rising', 'rising_fast'];
    const expected = ['falling', 'stable', 'rising', 'rising fast'];
    for (let i = 0; i < statuses.length; i++) {
      const ctx = { BTCUSDT: makeCtx('neutral', statuses[i]!, 'balanced') };
      const result = buildDerivativesNarrative(ctx);
      expect(result.oi).toBe(`${expected[i]!} on BTC`);
    }
  });

  it('maps all positioning labels correctly', () => {
    const statuses: DerivativesContext['positioningStatus'][] = ['long_heavy', 'short_heavy', 'balanced'];
    const expected = ['long-heavy', 'short-heavy', 'balanced'];
    for (let i = 0; i < statuses.length; i++) {
      const ctx = { BTCUSDT: makeCtx('neutral', 'stable', statuses[i]!) };
      const result = buildDerivativesNarrative(ctx);
      expect(result.positioning).toBe(`${expected[i]!} on BTC`);
    }
  });

  it('respects custom prioritySymbols list', () => {
    const ctx = {
      BTCUSDT: makeCtx('positive_elevated', 'rising', 'long_heavy'),
      SOLUSDT: makeCtx('neutral', 'stable', 'balanced', 'SOLUSDT'),
    };
    const result = buildDerivativesNarrative(ctx, ['BTCUSDT', 'SOLUSDT']);
    expect(result.funding).toBe('positive elevated on BTC, neutral on SOL');
  });

  it('always returns all three fields', () => {
    const result = buildDerivativesNarrative({
      BTCUSDT: makeCtx('neutral', 'stable', 'balanced'),
    });
    expect(result).toHaveProperty('funding');
    expect(result).toHaveProperty('oi');
    expect(result).toHaveProperty('positioning');
  });

  it('uses cross-venue derivatives consensus when available', () => {
    const consensus: DerivativesConsensus = {
      combinedLabel: 'cross_venue_neutral',
      confidenceContribution: 1,
      funding: {
        metric: 'funding',
        asset: 'BTC',
        venuesRequired: ['bybit', 'binance', 'okx'],
        venuesAvailable: ['bybit', 'binance', 'okx'],
        coverageScore: 1,
        agreementScore: 1,
        direction: 'neutral',
        perVenue: [],
        conflicts: [],
        verificationStatus: 'confirmed_cross_venue',
      },
      openInterest: {
        metric: 'open_interest',
        asset: 'BTC',
        venuesRequired: ['bybit', 'binance', 'okx'],
        venuesAvailable: ['bybit', 'binance', 'okx'],
        coverageScore: 1,
        agreementScore: 1,
        direction: 'neutral',
        perVenue: [],
        conflicts: [],
        verificationStatus: 'confirmed_cross_venue',
      },
    };

    const result = buildDerivativesNarrative(
      { BTCUSDT: makeCtx('positive_extreme', 'rising_fast', 'long_heavy') },
      ['BTCUSDT', 'ETHUSDT'],
      consensus,
    );

    expect(result.funding).toBe('neutral on 3/3 venues');
    expect(result.oi).toBe('neutral on 3/3 venues');
    expect(result.sourceScope).toBe('cross_venue');
    expect(result.verificationStatus).toBe('confirmed_cross_venue');
  });

  it('surfaces present-only OI coverage instead of implying stable OI', () => {
    const consensus: DerivativesConsensus = {
      combinedLabel: 'single_source',
      confidenceContribution: 0.7,
      funding: {
        metric: 'funding',
        asset: 'BTC',
        venuesRequired: ['bybit', 'binance', 'okx'],
        venuesAvailable: ['bybit', 'binance', 'okx'],
        coverageScore: 1,
        agreementScore: 1,
        direction: 'neutral',
        perVenue: [],
        conflicts: [],
        verificationStatus: 'confirmed_cross_venue',
      },
      openInterest: {
        metric: 'open_interest',
        asset: 'BTC',
        venuesRequired: ['bybit', 'binance', 'okx'],
        venuesAvailable: ['binance'],
        coverageScore: 0.33,
        agreementScore: 1,
        direction: 'neutral',
        perVenue: [
          { venue: 'okx', direction: 'unavailable', verificationStatus: 'unavailable', reason: 'OI present without change window' },
          { venue: 'binance', value: 0.2, direction: 'neutral', verificationStatus: 'source_scoped', reason: '0.2% OI 24h' },
        ],
        conflicts: [],
        verificationStatus: 'source_scoped',
      },
    };

    const result = buildDerivativesNarrative(
      { BTCUSDT: makeCtx('neutral', 'stable', 'balanced') },
      ['BTCUSDT', 'ETHUSDT'],
      consensus,
    );

    expect(result.oi).toBe('neutral on 1/3 venues; OI present without change window on OKX');
    expect(result.verificationStatus).toBe('source_scoped');
  });
});
