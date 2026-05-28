import { describe, it, expect } from 'vitest';
import { OverviewFormatter } from '../src/overview-formatter.js';
import type { OverviewOutput } from '../src/ports.js';

function makeOutput(overrides: Partial<OverviewOutput> = {}): OverviewOutput {
  const base: OverviewOutput = {
    briefId: 'brief-ASIA_CRYPTO-1716000000000',
    generatedAtUtc: '2026-05-18T22:30:00.000Z',
    session: 'ASIA_CRYPTO',
    marketRegime: 'constructive_but_extended',
    briefConfidence: 'medium',
    dataStatus: {
      price: 'fresh',
      events: 'partial',
      derivatives: 'fresh',
      liquidations: 'unavailable',
    },
    whatChanged: [
      'BTC moved from 94k to 96k — approaching weekly high.',
      'Funding shifted from neutral to positive elevated.',
    ],
    btc: {
      summary: 'BTC holding above daily midpoint with steady bid pressure.',
      keyLevels: ['97400', '95800'],
      position: 'above daily midpoint, below weekly high',
      structure: 'bullish',
    },
    eth: {
      summary: 'ETH consolidating near prior highs.',
      vsbtc: 'slight underperformance on 24h',
      keyLevels: ['3450'],
    },
    majorAssets: [
      { symbol: 'SOLUSDT', summary: 'Consolidating below ATH region.', keyLevels: ['185'] },
    ],
    alts: {
      summary: 'Selective rotation into large-cap alts.',
      rotationState: 'selective_rotation',
      breadth: '60% of top 50 green on 24h',
    },
    derivatives: {
      summary: '',
      funding: 'positive elevated across BTC/ETH',
      oi: 'rising slowly',
      positioning: 'long-heavy',
    },
    events: {
      summary: 'Light macro calendar this session.',
      upcoming: [],
    },
    scenarios: {
      reclaim: 'BTC clears 97,400 weekly high — extension toward 100k.',
      rejection: 'Failure at 97,400 — retest 95,800 daily open.',
      chop: 'Range 95,800–97,400, no clean resolution.',
    },
    note: 'Liquidation cluster data unavailable — confirm with live terminal before sizing decisions.',
  };
  return { ...base, ...overrides };
}

const formatter = new OverviewFormatter();

describe('OverviewFormatter.format()', () => {
  it('produces a non-empty string', () => {
    const result = formatter.format(makeOutput());
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('does not contain trading instruction phrases', () => {
    const result = formatter.format(makeOutput()).toLowerCase();
    expect(result).not.toMatch(/\bbuy here\b/);
    expect(result).not.toMatch(/\bsell here\b/);
    expect(result).not.toMatch(/\bgo long\b/);
    expect(result).not.toMatch(/\bgo short\b/);
    expect(result).not.toMatch(/\benter at\b/);
    expect(result).not.toMatch(/\bexit at\b/);
  });

  it('allows descriptive positioning terms: long-heavy, short-heavy', () => {
    const result = formatter.format(makeOutput()).toLowerCase();
    expect(result).toContain('long-heavy');
  });

  it('includes the session emoji and label for ASIA_CRYPTO', () => {
    const result = formatter.format(makeOutput({ session: 'ASIA_CRYPTO' }));
    expect(result).toContain('🌏');
    expect(result).toContain('Asia');
  });

  it('includes the session emoji and label for EUROPE_CRYPTO', () => {
    const result = formatter.format(makeOutput({ session: 'EUROPE_CRYPTO' }));
    expect(result).toContain('🌍');
    expect(result).toContain('Europe');
  });

  it('includes the session emoji and label for US_CRYPTO', () => {
    const result = formatter.format(makeOutput({ session: 'US_CRYPTO' }));
    expect(result).toContain('🌎');
    expect(result).toContain('US');
  });

  it('includes Sofia timestamp in header', () => {
    const result = formatter.format(makeOutput({ generatedAtUtc: '2026-05-18T22:30:00.000Z' }));
    // 2026-05-18T22:30 UTC = 2026-05-19T01:30 Sofia (EEST = UTC+3)
    expect(result).toContain('Sofia');
  });

  it('includes market regime and confidence', () => {
    const result = formatter.format(makeOutput());
    expect(result).toContain('Regime:');
    expect(result).toContain('constructive but extended');
    expect(result).toContain('Confidence: medium');
  });

  it('includes all three scenarios', () => {
    const result = formatter.format(makeOutput());
    expect(result).toContain('▶ Reclaim:');
    expect(result).toContain('▶ Rejection:');
    expect(result).toContain('▶ Chop:');
  });

  it('includes data status line', () => {
    const result = formatter.format(makeOutput());
    expect(result).toContain('Price: fresh');
    expect(result).toContain('Events: partial');
    expect(result).toContain('Liq: unavailable');
  });

  it('includes what changed bullets', () => {
    const result = formatter.format(makeOutput());
    expect(result).toContain('• BTC moved from 94k to 96k');
    expect(result).toContain('• Funding shifted');
  });

  it('includes BTC key levels', () => {
    const result = formatter.format(makeOutput());
    expect(result).toContain('97400');
    expect(result).toContain('95800');
  });

  it('includes major assets section when non-empty', () => {
    const result = formatter.format(makeOutput());
    expect(result).toContain('📈 Major Assets');
    expect(result).toContain('SOLUSDT');
  });

  it('omits major assets section when empty', () => {
    const result = formatter.format(makeOutput({ majorAssets: [] }));
    expect(result).not.toContain('📈 Major Assets');
  });

  it('includes events section when upcoming is non-empty', () => {
    const output = makeOutput({
      events: {
        summary: 'FOMC today.',
        upcoming: [{ title: 'FOMC Minutes', time: '21:00 UTC', importance: 'critical' }],
      },
    });
    const result = formatter.format(output);
    expect(result).toContain('📅 Events');
    expect(result).toContain('FOMC Minutes');
    expect(result).toContain('🔴');
  });

  it('includes events section when summary is non-empty even with empty upcoming', () => {
    const output = makeOutput({
      events: { summary: 'Light macro calendar this session.', upcoming: [] },
    });
    const result = formatter.format(output);
    expect(result).toContain('📅 Events');
  });

  it('omits events section when both summary and upcoming are empty', () => {
    const output = makeOutput({ events: { summary: '', upcoming: [] } });
    const result = formatter.format(output);
    expect(result).not.toContain('📅 Events');
  });

  it('includes footer separator and note', () => {
    const result = formatter.format(makeOutput());
    expect(result).toContain('─────────────────────');
    expect(result).toContain('Liquidation cluster data unavailable');
  });

  it('omits derivatives summary line when summary is blank', () => {
    const output = makeOutput({
      derivatives: { summary: '', funding: 'neutral', oi: 'stable', positioning: 'balanced' },
    });
    const result = formatter.format(output);
    // Summary should not appear as a standalone line
    expect(result).not.toMatch(/\n\n\n/);
  });
});

describe('OverviewFormatter.splitForTelegram()', () => {
  it('returns array of length 1 for a short report', () => {
    const shortReport = 'Short report text.';
    const result = formatter.splitForTelegram(shortReport);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(shortReport);
  });

  it('returns the original string unchanged for report at exactly maxLength', () => {
    const report = 'a'.repeat(4096);
    const result = formatter.splitForTelegram(report);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(report);
  });

  it('splits a long report into multiple chunks each <= 4096 chars', () => {
    const lines = Array.from({ length: 200 }, (_, i) => `Line ${i}: ${'x'.repeat(30)}`);
    const report = lines.join('\n');
    expect(report.length).toBeGreaterThan(4096);

    const chunks = formatter.splitForTelegram(report);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(4096);
    }
  });

  it('reassembled chunks contain all lines from the original report', () => {
    const lines = Array.from({ length: 200 }, (_, i) => `Line ${i}: ${'x'.repeat(30)}`);
    const report = lines.join('\n');

    const chunks = formatter.splitForTelegram(report);
    const reassembled = chunks.join('\n');

    for (const line of lines) {
      expect(reassembled).toContain(line);
    }
  });

  it('returns multiple parts for a report longer than 4096 chars', () => {
    const longLine = 'x'.repeat(2000);
    const report = `${longLine}\n${longLine}\n${longLine}`;
    expect(report.length).toBeGreaterThan(4096);

    const chunks = formatter.splitForTelegram(report);
    expect(chunks.length).toBeGreaterThan(1);
  });
});
