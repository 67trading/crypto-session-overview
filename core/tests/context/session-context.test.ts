import { describe, it, expect } from 'vitest';
import {
  extractSessionHighLow,
  detectSessionContinuation,
  buildSessionContext,
} from '../../src/context/session-context.js';
import type { HtfCandle } from '../../src/levels/htf-levels.js';

const FOUR_HOURS_MS = 14_400_000;

function makeCandle(openTimeMs: number, high: number, low: number, open: number, close: number): HtfCandle {
  return { openTimeMs, closeTimeMs: openTimeMs + FOUR_HOURS_MS, high, low, open, close, volume: 1000 };
}

const boundary = { startMs: FOUR_HOURS_MS, endMs: FOUR_HOURS_MS * 3 };

const candles: HtfCandle[] = [
  makeCandle(0, 110, 90, 95, 105),   // before boundary
  makeCandle(FOUR_HOURS_MS, 120, 95, 100, 115), // inside
  makeCandle(FOUR_HOURS_MS * 2, 125, 100, 115, 118), // inside
  makeCandle(FOUR_HOURS_MS * 3, 130, 105, 118, 128), // at endMs (excluded)
];

describe('extractSessionHighLow', () => {
  it('filters candles to boundary and returns correct high/low', () => {
    const result = extractSessionHighLow('ASIA_CRYPTO', candles, boundary);
    expect(result).not.toBeNull();
    expect(result!.high).toBe(125);
    expect(result!.low).toBe(95);
    expect(result!.open).toBe(100);
    expect(result!.close).toBe(118);
    expect(result!.session).toBe('ASIA_CRYPTO');
  });

  it('returns null when no candles fall in boundary', () => {
    const result = extractSessionHighLow('ASIA_CRYPTO', candles, {
      startMs: FOUR_HOURS_MS * 5,
      endMs: FOUR_HOURS_MS * 6,
    });
    expect(result).toBeNull();
  });

  it('midpoint is average of high and low', () => {
    const result = extractSessionHighLow('ASIA_CRYPTO', candles, boundary);
    expect(result!.midpoint).toBe((125 + 95) / 2);
  });
});

describe('buildSessionContext', () => {
  it('uses the first candle overlapping the current boundary as current session open', () => {
    const currentBoundary = {
      session: 'EUROPE_CRYPTO' as const,
      startMs: Date.UTC(2026, 5, 4, 7),
      endMs: Date.UTC(2026, 5, 4, 16),
    };
    const previousBoundary = {
      session: 'ASIA_CRYPTO' as const,
      startMs: Date.UTC(2026, 5, 4, 0),
      endMs: Date.UTC(2026, 5, 4, 8),
    };
    const candlesForContext: HtfCandle[] = [
      { openTimeMs: Date.UTC(2026, 5, 4, 0), closeTimeMs: Date.UTC(2026, 5, 4, 4), open: 100, high: 120, low: 90, close: 110, volume: 1 },
      { openTimeMs: Date.UTC(2026, 5, 4, 4), closeTimeMs: Date.UTC(2026, 5, 4, 8), open: 110, high: 125, low: 105, close: 115, volume: 1 },
      { openTimeMs: Date.UTC(2026, 5, 4, 8), closeTimeMs: Date.UTC(2026, 5, 4, 12), open: 115, high: 130, low: 112, close: 118, volume: 1 },
    ];

    const result = buildSessionContext({
      session: 'EUROPE_CRYPTO',
      currentPrice: 116,
      fourHourCandles: candlesForContext,
      currentBoundary,
      previousBoundary,
      now: new Date(Date.UTC(2026, 5, 4, 9)),
    });

    expect(result.previousSessionHighLow).toEqual(expect.objectContaining({
      high: 125,
      low: 90,
      open: 100,
      close: 115,
    }));
    expect(result.currentSessionOpen).toBe(110);
    expect(result.currentSessionOpenStatus).toBe('confirmed');
  });

  it('does not fabricate a current session open before the session starts', () => {
    const currentBoundary = {
      session: 'US_CRYPTO' as const,
      startMs: Date.UTC(2026, 5, 4, 13),
      endMs: Date.UTC(2026, 5, 4, 21),
    };
    const result = buildSessionContext({
      session: 'US_CRYPTO',
      currentPrice: 116,
      fourHourCandles: [
        { openTimeMs: Date.UTC(2026, 5, 4, 8), closeTimeMs: Date.UTC(2026, 5, 4, 12), open: 100, high: 120, low: 90, close: 110, volume: 1 },
      ],
      currentBoundary,
      previousBoundary: null,
      now: new Date(Date.UTC(2026, 5, 4, 12)),
    });

    expect(result.currentSessionOpen).toBeUndefined();
    expect(result.currentSessionOpenStatus).toBe('not_started');
  });
});

describe('detectSessionContinuation', () => {
  const prevSession = {
    session: 'ASIA_CRYPTO' as const,
    high: 100,
    low: 80,
    midpoint: 90,
    open: 85,
    close: 88,
  };

  it('returns breakout_above when price is > 0.1% above high', () => {
    expect(detectSessionContinuation(102, prevSession)).toBe('breakout_above');
  });

  it('returns breakout_below when price is > 0.1% below low', () => {
    expect(detectSessionContinuation(79, prevSession)).toBe('breakout_below');
  });

  it('returns inside_range for a neutral mid-range price', () => {
    // open=85 < midpoint=90, currentPrice=88 > open but open<midpoint → not continuation_bullish
    // open=85 < midpoint=90, but we need open < midpoint AND currentPrice < open for continuation_bearish
    // 88 > 85, so neither bearish continuation
    // in top 20%: high - range*0.2 = 100 - 20*0.2 = 96, so < 96 → not rejection_from_high
    // in bottom 20%: low + range*0.2 = 80 + 4 = 84, 88 > 84 → not rejection_from_low
    // open(85) < midpoint(90) and price(88) > open(85) → does NOT satisfy continuation_bearish
    // open(85) < midpoint(90), for continuation_bullish: need open > midpoint → false
    expect(detectSessionContinuation(88, prevSession)).toBe('inside_range');
  });

  it('returns rejection_from_high when in top 20% of range', () => {
    // top 20%: high - range*0.2 = 100 - 4 = 96, price=97 >= 96
    expect(detectSessionContinuation(97, prevSession)).toBe('rejection_from_high');
  });

  it('returns rejection_from_low when in bottom 20% of range', () => {
    // bottom 20%: low + range*0.2 = 80 + 4 = 84, price=82 <= 84
    expect(detectSessionContinuation(82, prevSession)).toBe('rejection_from_low');
  });
});
