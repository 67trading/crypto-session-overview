import { describe, expect, it } from 'vitest';
import { buildBtcPresentationContext } from '../src/btc-presentation-builder.js';
import type { HtfLevelsSnapshot } from '../src/ports.js';

function makeLevels(overrides: Partial<HtfLevelsSnapshot> = {}): HtfLevelsSnapshot {
  return {
    weekly: {
      currentWeekOpen: 71000,
      previousWeekHigh: 78089.9,
      previousWeekLow: 65000,
      previousWeekClose: 67000,
      weeklyMidpoint: 75291.2,
      weeklyPosition: 'below_midpoint',
    },
    daily: {
      currentDayOpen: 66754.8,
      previousDayHigh: 71413.9,
      previousDayLow: 66200,
      previousDayClose: 66700,
      dailyMidpoint: 68806.95,
      dailyPosition: 'below_midpoint',
    },
    fourHour: {
      lastSwingHigh: 74225.4,
      lastSwingLow: 65412,
      structure: 'range',
      supportZone: { low: 65215.76, high: 65608.24 },
      resistanceZone: { low: 74002.72, high: 74448.08 },
    },
    ...overrides,
  };
}

describe('buildBtcPresentationContext()', () => {
  it('renders weak BTC with 4H range as bearish range pressure', () => {
    const context = buildBtcPresentationContext({
      btcTone: 'weak',
      levels: makeLevels(),
      spotPrice: 66700.12,
    });

    expect(context.structure).toBe('bearish');
    expect(context.headerLabel).toBe('bearish range pressure');
    expect(context.position).toBe('Below daily midpoint and below weekly midpoint.');
    expect(context.summary).toBe('BTC remains inside the 4H range, but below daily and weekly midpoints, leaving pressure to the downside.');
    expect(context.summary).not.toMatch(/bullish/i);
    expect(context.summary).toMatch(/\.$/);
    expect(context.spotPrice).toBe(66700.12);
    expect(context.keyLevelsDisplay).toEqual([
      '78,089.9 (previous week high)',
      '74,225.4 (4H last swing high)',
    ]);
  });

  it('renders previous-week breakout as bullish breakout', () => {
    const context = buildBtcPresentationContext({
      btcTone: 'bullish_breakout',
      levels: makeLevels({
        weekly: {
          currentWeekOpen: 79000,
          previousWeekHigh: 78000,
          previousWeekLow: 70000,
          previousWeekClose: 77500,
          weeklyMidpoint: 74000,
          weeklyPosition: 'above_midpoint',
        },
        daily: {
          currentDayOpen: 78500,
          previousDayHigh: 79000,
          previousDayLow: 76000,
          previousDayClose: 78200,
          dailyMidpoint: 77500,
          dailyPosition: 'above_midpoint',
        },
        fourHour: {
          lastSwingHigh: 79500,
          lastSwingLow: 77000,
          structure: 'bullish',
          supportZone: { low: 76769, high: 77231 },
          resistanceZone: { low: 79261.5, high: 79738.5 },
        },
      }),
    });

    expect(context.structure).toBe('bullish');
    expect(context.headerLabel).toBe('bullish breakout');
    expect(context.position).toBe('Above daily midpoint and above weekly midpoint.');
    expect(context.summary).toContain('bullish breakout');
  });
});
