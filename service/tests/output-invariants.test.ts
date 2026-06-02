import { describe, it, expect } from 'vitest';
import { scanForForbiddenPhrases, checkOutputInvariants, checkSourceAwareOutputInvariants, hasHardViolations, FORBIDDEN_PHRASES } from '../src/output-invariants.js';
import { PRODUCT_FOOTER_NOTE } from '../src/presentation-contract.js';
import type { OverviewInput, OverviewOutput } from '../src/ports.js';

function makeOutput(overrides: Partial<OverviewOutput> = {}): OverviewOutput {
  return {
    briefId: 'brief-test-1',
    generatedAtUtc: '2026-01-01T00:00:00Z',
    session: 'US_CRYPTO',
    marketRegime: 'constructive_but_extended',
    briefConfidence: 'medium',
    dataStatus: { price: 'fresh', events: 'fresh', derivatives: 'fresh', liquidations: 'unavailable' },
    whatChanged: ['No previous brief available for this session — initial reading.'],
    btc: { summary: 'BTC trading near resistance.', keyLevels: ['97000'], position: 'above daily midpoint', structure: 'bullish' },
    eth: { summary: 'ETH in line with BTC.', vsbtc: 'ETH/BTC sideways (+0.1% over 7d)', keyLevels: ['3200'] },
    majorAssets: [],
    alts: { summary: 'Alts quiet.', rotationState: 'selective_rotation', breadth: '55% of 10 tracked alts positive on 24h' },
    derivatives: { summary: 'Neutral overall.', funding: 'neutral across BTC/ETH', oi: 'stable across BTC/ETH', positioning: 'balanced across BTC/ETH' },
    liquidity: { bullets: ['No significant liquidity clusters identified.'] },
    events: { summary: 'Light macro calendar.', upcoming: [{ title: 'CPI Release', time: '2026-01-02T13:30:00Z', importance: 'critical' }] },
    scenarios: { reclaim: 'Continuation toward ATH.', rejection: 'Pullback to support.', chop: 'Range persists.' },
    note: PRODUCT_FOOTER_NOTE,
    ...overrides,
  };
}

function makeInput(overrides: Partial<OverviewInput> = {}): OverviewInput {
  return {
    request: {
      session: 'US_CRYPTO',
      createdAt: '2026-01-01T00:00:00Z',
      timezone: 'UTC',
      allowedTimeframes: ['Weekly', 'Daily', '4H', 'Session'],
      forbiddenTimeframes: ['1H', '15m', '5m'],
    },
    universe: { coreSymbols: ['BTCUSDT'], majorSymbols: [], watchSymbols: [] },
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

describe('FORBIDDEN_PHRASES', () => {
  it('includes expanded prohibited execution phrases', () => {
    expect(FORBIDDEN_PHRASES.length).toBeGreaterThan(8);
    expect(FORBIDDEN_PHRASES).toContain('buy here');
    expect(FORBIDDEN_PHRASES).toContain('go long');
    expect(FORBIDDEN_PHRASES).toContain('open long');
    expect(FORBIDDEN_PHRASES).toContain('position size');
    expect(FORBIDDEN_PHRASES).toContain('place a trade');
  });
});

describe('scanForForbiddenPhrases()', () => {
  it('returns empty array for a clean output', () => {
    const result = scanForForbiddenPhrases(makeOutput());
    expect(result).toHaveLength(0);
  });

  it('detects forbidden phrase in btc.summary', () => {
    const output = makeOutput({ btc: { ...makeOutput().btc, summary: 'BTC looks good, buy here at 97000.' } });
    const violations = scanForForbiddenPhrases(output);
    expect(violations.some((v) => v.includes('buy here'))).toBe(true);
  });

  it('detects forbidden phrase in scenarios', () => {
    const output = makeOutput({
      scenarios: {
        reclaim: 'Go long above 98000.',
        rejection: 'Pullback expected.',
        chop: 'Range persists.',
      },
    });
    const violations = scanForForbiddenPhrases(output);
    expect(violations.some((v) => v.includes('go long'))).toBe(true);
  });

  it('detects forbidden phrase in note', () => {
    const output = makeOutput({ note: 'Consider to enter at 97500 on a breakout.' });
    const violations = scanForForbiddenPhrases(output);
    expect(violations.some((v) => v.includes('enter at'))).toBe(true);
  });

  it('detects forbidden phrase in whatChanged bullets', () => {
    const output = makeOutput({ whatChanged: ['Regime changed — sell here before FOMC.'] });
    const violations = scanForForbiddenPhrases(output);
    expect(violations.some((v) => v.includes('sell here'))).toBe(true);
  });

  it('is case-insensitive', () => {
    const output = makeOutput({ note: 'BUY HERE at support.' });
    const violations = scanForForbiddenPhrases(output);
    expect(violations).not.toHaveLength(0);
  });

  it.each(Array.from(FORBIDDEN_PHRASES))('detects "%s"', (phrase) => {
    const output = makeOutput({ note: `Traders should ${phrase} the breakout.` });
    const violations = scanForForbiddenPhrases(output);
    expect(violations.some((v) => v.includes(phrase))).toBe(true);
  });

  it('reports no violations for allowed descriptive terms', () => {
    const output = makeOutput({
      derivatives: {
        summary: 'Long-heavy positioning with positive elevated funding.',
        funding: 'positive elevated across BTC/ETH',
        oi: 'rising on BTC',
        positioning: 'long-heavy on BTC, balanced on ETH',
      },
    });
    expect(scanForForbiddenPhrases(output)).toHaveLength(0);
  });

  it('allows market-structure language using open above or open below', () => {
    const output = makeOutput({
      scenarios: {
        reclaim: 'If BTC can open above the weekly high, continuation pressure can improve.',
        rejection: 'A daily open below support would keep structure defensive.',
        chop: 'Range persists.',
      },
    });
    expect(scanForForbiddenPhrases(output)).toHaveLength(0);
  });

  it.each([
    ['open long above 75K', 'open long'],
    ['enter at 75K on reclaim', 'enter at'],
    ['position size should be reduced', 'position size'],
    ['use leverage only after confirmation', 'use leverage'],
    ['risk 1% on the setup', 'risk X%'],
  ])('detects execution instruction "%s"', (text, expected) => {
    const output = makeOutput({ note: text });
    const violations = scanForForbiddenPhrases(output);
    expect(violations.some((v) => v.includes(expected))).toBe(true);
  });

  it('allows long/short ratio as market context', () => {
    const output = makeOutput({
      derivatives: {
        summary: 'Long/short ratio remains elevated while short-heavy positioning cools.',
        funding: 'neutral',
        oi: 'stable',
        positioning: 'long/short ratio elevated, short-heavy but improving',
      },
    });
    expect(scanForForbiddenPhrases(output)).toHaveLength(0);
  });
});

describe('checkOutputInvariants()', () => {
  it('returns empty array for a fully valid output', () => {
    const violations = checkOutputInvariants(makeOutput());
    expect(violations).toHaveLength(0);
  });

  it('flags whatChanged with 0 items', () => {
    const output = makeOutput({ whatChanged: [] });
    const violations = checkOutputInvariants(output);
    expect(violations.some((v) => v.includes('whatChanged'))).toBe(true);
  });

  it('flags whatChanged with 9 items', () => {
    const output = makeOutput({ whatChanged: Array(9).fill('bullet') });
    const violations = checkOutputInvariants(output);
    expect(violations.some((v) => v.includes('whatChanged'))).toBe(true);
  });

  it('accepts whatChanged with exactly 1 item', () => {
    const output = makeOutput({ whatChanged: ['Single change.'] });
    expect(checkOutputInvariants(output)).toHaveLength(0);
  });

  it('accepts whatChanged with exactly 8 items', () => {
    const output = makeOutput({ whatChanged: Array(8).fill('change') });
    expect(checkOutputInvariants(output)).toHaveLength(0);
  });

  it('flags empty liquidity bullets', () => {
    const output = makeOutput({ liquidity: { bullets: [] } });
    const violations = checkOutputInvariants(output);
    expect(violations.some((v) => v.includes('liquidity.bullets'))).toBe(true);
  });

  it('flags missing liquidity field', () => {
    const output = makeOutput({ liquidity: undefined as unknown as { bullets: string[] } });
    const violations = checkOutputInvariants(output);
    expect(violations.some((v) => v.includes('liquidity.bullets'))).toBe(true);
  });

  it('accepts valid liquidity bullets', () => {
    const output = makeOutput({
      liquidity: { bullets: ['Immediate upside resistance: 97,400.'] },
    });
    expect(checkOutputInvariants(output)).toHaveLength(0);
  });

  it('flags empty scenarios fields', () => {
    const output = makeOutput({ scenarios: { reclaim: '', rejection: 'x', chop: 'x' } });
    const violations = checkOutputInvariants(output);
    expect(violations.some((v) => v.includes('scenarios.reclaim'))).toBe(true);
  });

  it('flags empty note', () => {
    const output = makeOutput({ note: '' });
    const violations = checkOutputInvariants(output);
    expect(violations.some((v) => v.includes('note'))).toBe(true);
  });

  it('flags note that does not match the product footer contract', () => {
    const output = makeOutput({ note: 'Data quality normal.' });
    const violations = checkOutputInvariants(output);
    expect(violations).toContain('note must match product footer contract');
  });

  it('flags empty briefId', () => {
    const output = makeOutput({ briefId: '' });
    const violations = checkOutputInvariants(output);
    expect(violations.some((v) => v.includes('briefId'))).toBe(true);
  });

  it('includes forbidden phrase violations', () => {
    const output = makeOutput({ scenarios: { reclaim: 'Go long.', rejection: 'x', chop: 'x' } });
    const violations = checkOutputInvariants(output);
    expect(violations.some((v) => v.includes('go long'))).toBe(true);
  });
});

describe('checkSourceAwareOutputInvariants()', () => {
  it('flags ETF flow claims when no ETF source is available', () => {
    const output = makeOutput({ note: 'BTC ETF flows were positive.' });
    const violations = checkSourceAwareOutputInvariants(output, makeInput());
    expect(violations).toContain('ETF flow claims require a successful ETF flow source');
  });

  it('allows ETF flow claims when ETF context has sourceAvailable', () => {
    const output = makeOutput({ note: 'BTC ETF flows were positive.' });
    const input = makeInput({
      etfFlowContext: { btcFlowUsd: 10_000_000, date: '2026-01-01', source: 'sosovalue', sourceAvailable: true },
    });
    expect(checkSourceAwareOutputInvariants(output, input)).toHaveLength(0);
  });

  it('flags ETH ETF flow claims when only BTC ETF flow data is available', () => {
    const output = makeOutput({ note: 'ETH ETF flows were positive.' });
    const input = makeInput({
      etfFlowContext: { btcFlowUsd: 10_000_000, date: '2026-01-01', source: 'sosovalue', sourceAvailable: true },
    });
    expect(checkSourceAwareOutputInvariants(output, input)).toContain('ETH ETF flow claims require successful ETH ETF flow data');
  });

  it('flags no-unlock claims unless mobula-unlocks succeeded', () => {
    const output = makeOutput({ events: { summary: 'No confirmed token unlocks for this session.', upcoming: [] } });
    const violations = checkSourceAwareOutputInvariants(output, makeInput());
    expect(violations).toContain('Token unlock absence claims require successful mobula-unlocks primary source');
  });

  it('does not treat unrelated "no" plus explicit unlock report as an absence claim', () => {
    const output = makeOutput({
      events: {
        summary: 'No major macro catalysts today; token unlocks from Arbitrum confirmed at 14:00 UTC.',
        upcoming: [],
      },
    });
    const violations = checkSourceAwareOutputInvariants(output, makeInput());
    expect(violations).not.toContain('Token unlock absence claims require successful mobula-unlocks primary source');
  });

  it('allows no-unlock claims when mobula-unlocks succeeded', () => {
    const output = makeOutput({ events: { summary: 'No confirmed token unlocks for this session.', upcoming: [] } });
    const input = makeInput({
      sourceHealth: {
        collectors: [{ name: 'mobula-unlocks', source: 'mobula-unlocks', status: 'success', itemCount: 0 }],
        healthyCount: 1,
        partialCount: 0,
        failedCount: 0,
        skippedCount: 0,
      },
    });
    expect(checkSourceAwareOutputInvariants(output, input)).toHaveLength(0);
  });

  it('flags strong rates claims when FRED is quota-limited', () => {
    const output = makeOutput({ note: 'US rates confirm risk-off pressure into the session.' });
    const input = makeInput({
      sourceHealth: {
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
      },
    });

    expect(checkSourceAwareOutputInvariants(output, input)).toContain('Strong macro rates claims require complete FRED/BoJ source data');
  });

  it('flags strong BoJ claims when BoJ via FRED is skipped for quota', () => {
    const output = makeOutput({ note: 'BoJ confirms a supportive macro backdrop.' });
    const input = makeInput({
      sourceHealth: {
        collectors: [{
          name: 'boj-rates',
          source: 'boj-rates',
          status: 'skipped',
          itemCount: 0,
          reasonCode: 'ACCESS_LIMITED_QUOTA',
        }],
        healthyCount: 0,
        partialCount: 0,
        failedCount: 0,
        skippedCount: 1,
      },
    });

    expect(checkSourceAwareOutputInvariants(output, input)).toContain('Strong macro rates claims require complete FRED/BoJ source data');
  });

  it('allows cautious macro wording when FRED is quota-limited', () => {
    const output = makeOutput({ note: 'US rates context is partial because some FRED series were rate-limited.' });
    const input = makeInput({
      sourceHealth: {
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
      },
    });

    expect(checkSourceAwareOutputInvariants(output, input)).toHaveLength(0);
  });

  it('flags options claims when Deribit options context is unavailable', () => {
    const output = makeOutput({
      liquidity: {
        bullets: ['Deribit BTC options expiry keeps 75K max pain relevant.'],
      },
    });
    expect(checkSourceAwareOutputInvariants(output, makeInput())).toContain('Options claims require successful Deribit options context');
  });

  it('allows options claims when Deribit options context is available', () => {
    const output = makeOutput({
      liquidity: {
        bullets: ['Deribit BTC options context keeps max pain 75000 relevant.'],
      },
    });
    const input = makeInput({
      optionsContext: [{ symbol: 'BTC', maxPainStrike: 75000 }],
      sourceHealth: {
        collectors: [{ name: 'deribit-options', source: 'deribit-options', status: 'success', itemCount: 1 }],
        healthyCount: 1,
        partialCount: 0,
        failedCount: 0,
        skippedCount: 0,
      },
    });
    expect(checkSourceAwareOutputInvariants(output, input)).toHaveLength(0);
  });

  it('flags exact liquidation cluster claims without confirmed cluster data', () => {
    const output = makeOutput({
      liquidity: {
        bullets: ['Large liquidation cluster above 75K is the nearest upside magnet.'],
      },
    });
    expect(checkSourceAwareOutputInvariants(output, makeInput())).toContain('Exact liquidation cluster claims require confirmed liquidity cluster data');
  });

  it('allows general liquidation pressure wording without cluster data', () => {
    const output = makeOutput({
      derivatives: {
        summary: 'Liquidation activity increased during the selloff.',
        funding: 'neutral',
        oi: 'rising',
        positioning: 'long-heavy',
      },
    });
    expect(checkSourceAwareOutputInvariants(output, makeInput())).toHaveLength(0);
  });

  it('allows explicit no-confirmed liquidation cluster caveats without cluster data', () => {
    const output = makeOutput({
      liquidity: {
        bullets: ['No confirmed liquidation cluster data available.'],
      },
    });
    expect(checkSourceAwareOutputInvariants(output, makeInput())).toHaveLength(0);
  });
});

describe('hasHardViolations()', () => {
  it('returns true when output contains a forbidden phrase', () => {
    const output = makeOutput({ note: 'Go long at 97k.' });
    expect(hasHardViolations(output)).toBe(true);
  });

  it('returns true when liquidity bullets are empty', () => {
    const output = makeOutput({ liquidity: { bullets: [] } });
    expect(hasHardViolations(output)).toBe(true);
  });

  it('returns true when a scenario field is empty', () => {
    const output = makeOutput({ scenarios: { reclaim: '', rejection: 'x', chop: 'x' } });
    expect(hasHardViolations(output)).toBe(true);
  });

  it('returns false for a clean output', () => {
    expect(hasHardViolations(makeOutput())).toBe(false);
  });
});
