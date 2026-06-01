import { describe, it, expect } from 'vitest';
import { scanForForbiddenPhrases, checkOutputInvariants, hasHardViolations, FORBIDDEN_PHRASES } from '../src/output-invariants.js';
import type { OverviewOutput } from '../src/ports.js';

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
    note: 'No caveats.',
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
