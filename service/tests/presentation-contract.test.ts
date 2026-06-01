import { describe, expect, it } from 'vitest';
import { buildPresentationContext, PRODUCT_FOOTER_NOTE } from '../src/presentation-contract.js';
import type { OverviewInput } from '../src/ports.js';

function makeInput(overrides: Partial<OverviewInput> = {}): OverviewInput {
  return {
    request: {
      session: 'US_CRYPTO',
      createdAt: '2026-06-01T00:00:00Z',
      timezone: 'UTC',
      allowedTimeframes: ['Weekly', 'Daily', '4H', 'Session'],
      forbiddenTimeframes: ['1H', '15m', '5m'],
    },
    universe: { coreSymbols: ['BTCUSDT', 'ETHUSDT'], majorSymbols: [], watchSymbols: [] },
    marketContext: { btcTone: 'neutral', ethVsBtc: 'in_line' },
    levels: {},
    sessionContext: null,
    derivativesContext: {},
    eventsForSession: [],
    activeSetups: [],
    dataQuality: { collectors: [], missingSources: [], failedSources: [] },
    ...overrides,
  };
}

describe('PRODUCT_FOOTER_NOTE', () => {
  it('matches the Telegram product contract exactly', () => {
    expect(PRODUCT_FOOTER_NOTE).toBe('This is market context only. No entries, exits, position sizing or leverage.');
  });
});

describe('buildPresentationContext()', () => {
  it('creates source-aware ETF flow wording when real flow data is available', () => {
    const context = buildPresentationContext(makeInput({
      etfFlowContext: {
        btcFlowUsd: 12_500_000,
        date: '2026-06-01',
        source: 'sosovalue',
        sourceAvailable: true,
      },
    }));

    expect(context.etfNarrative.claimAllowed).toBe(true);
    expect(context.etfNarrative.bullets[0]).toContain('ETF flows show BTC');
  });

  it('uses holdings proxy wording for proxy ETF data', () => {
    const context = buildPresentationContext(makeInput({
      etfFlowContext: {
        btcFlowUsd: 12_500_000,
        date: '2026-06-01',
        source: 'issuer-holdings-proxy',
        sourceAvailable: true,
        isProxy: true,
      },
    }));

    expect(context.etfNarrative.proxyOnly).toBe(true);
    expect(context.etfNarrative.bullets[0]).toContain('ETF holdings proxy suggests');
  });

  it('allows options claims only when Deribit context succeeded', () => {
    const context = buildPresentationContext(makeInput({
      optionsContext: [{ symbol: 'BTC', maxPainStrike: 75000, putCallRatio: 0.8 }],
      sourceHealth: {
        collectors: [{ name: 'deribit-options', source: 'deribit-options', status: 'success', itemCount: 1 }],
        healthyCount: 1,
        partialCount: 0,
        failedCount: 0,
        skippedCount: 0,
      },
    }));

    expect(context.optionsNarrative.claimAllowed).toBe(true);
    expect(context.optionsNarrative.bullets[0]).toContain('Deribit BTC options context');
  });

  it('marks macro strong claims unsafe when FRED is quota-limited', () => {
    const context = buildPresentationContext(makeInput({
      sourceHealth: {
        collectors: [{
          name: 'fred-rates',
          source: 'fred-rates',
          status: 'partial',
          itemCount: 1,
          reasonCode: 'ACCESS_LIMITED_QUOTA',
        }],
        healthyCount: 0,
        partialCount: 1,
        failedCount: 0,
        skippedCount: 0,
      },
    }));

    expect(context.macroNarrative.strongClaimAllowed).toBe(false);
    expect(context.macroNarrative.bullets[0]).toContain('rate-limited');
  });
});
