import { describe, it, expect } from 'vitest';
import { OverviewInputBuilder } from '../src/overview-input-builder.js';
import type {
  CryptoSession,
  OverviewMarketSnapshot,
  HtfLevelsSnapshot,
  NormalizedEvent,
  DerivativesContext,
  ActiveOverviewSetup,
} from '../src/ports.js';

function makeCandle(open: number, close: number) {
  return {
    openTimeMs: 0,
    closeTimeMs: 1,
    open,
    high: Math.max(open, close) + 10,
    low: Math.min(open, close) - 10,
    close,
    volume: 1000,
  };
}

function makeSnapshot(symbol: string, latestPrice: number, dailyOpen: number, dailyClose: number): OverviewMarketSnapshot {
  return {
    symbol,
    latestPrice,
    candles: {
      weekly: [makeCandle(90000, 95000)],
      daily: [makeCandle(dailyOpen, dailyClose)],
      fourHour: [makeCandle(94000, 95000)],
    },
  };
}

function makeBtcLevels(dailyMidpoint: number, previousWeekHigh = 100000, previousWeekLow = 80000): HtfLevelsSnapshot {
  return {
    weekly: {
      currentWeekOpen: 90000,
      previousWeekHigh,
      previousWeekLow,
      previousWeekClose: 92000,
      weeklyMidpoint: (previousWeekHigh + previousWeekLow) / 2,
      weeklyPosition: 'above_midpoint',
    },
    daily: {
      currentDayOpen: dailyMidpoint - 500,
      previousDayHigh: dailyMidpoint + 1000,
      previousDayLow: dailyMidpoint - 1000,
      previousDayClose: dailyMidpoint + 200,
      dailyMidpoint,
      dailyPosition: 'at_midpoint',
    },
    fourHour: null,
  };
}

function makeEvent(id: string, score: number): NormalizedEvent {
  return {
    eventId: id,
    eventType: 'fomc',
    category: 'macro',
    title: `Event ${id}`,
    detectedAt: new Date().toISOString(),
    importance: 'medium',
    sessionRelevance: ['US_CRYPTO'],
    source: 'test',
    summary: 'summary',
    confidence: 'medium',
    dedupeKey: id,
    relevanceScore: score,
  };
}

const builder = new OverviewInputBuilder();

const baseSymbols = { core: ['BTCUSDT'], major: ['ETHUSDT'], watch: ['SOLUSDT'] };

describe('OverviewInputBuilder.build()', () => {
  it('returns OverviewInput with correct session, allowedTimeframes, forbiddenTimeframes', () => {
    const session: CryptoSession = 'ASIA_CRYPTO';
    const result = builder.build({
      session,
      symbols: baseSymbols,
      marketSnapshots: [],
      derivativesContext: {},
      events: [],
      activeSetups: [],
      sessionContext: null,
      levels: {},
      tokenBudget: 100_000,
      dataQuality: { collectors: [], missingSources: [], failedSources: [] },
    });

    expect(result.request.session).toBe('ASIA_CRYPTO');
    expect(result.request.allowedTimeframes).toEqual(['Weekly', 'Daily', '4H', 'Session']);
    expect(result.request.forbiddenTimeframes).toEqual(['1H', '15m', '5m']);
    expect(result.request.timezone).toBe('UTC');
  });

  it('sorts events by relevanceScore DESC', () => {
    const events = [makeEvent('low', 0.3), makeEvent('high', 0.9), makeEvent('mid', 0.6)];
    const result = builder.build({
      session: 'US_CRYPTO',
      symbols: baseSymbols,
      marketSnapshots: [],
      derivativesContext: {},
      events,
      activeSetups: [],
      sessionContext: null,
      levels: {},
      tokenBudget: 100_000,
      dataQuality: { collectors: [], missingSources: [], failedSources: [] },
    });

    expect(result.eventsForSession[0]?.eventId).toBe('high');
    expect(result.eventsForSession[1]?.eventId).toBe('mid');
    expect(result.eventsForSession[2]?.eventId).toBe('low');
  });

  it('passes levels through unchanged', () => {
    const levels: Record<string, HtfLevelsSnapshot> = {
      BTCUSDT: makeBtcLevels(95000),
    };
    const result = builder.build({
      session: 'EUROPE_CRYPTO',
      symbols: baseSymbols,
      marketSnapshots: [],
      derivativesContext: {},
      events: [],
      activeSetups: [],
      sessionContext: null,
      levels,
      tokenBudget: 100_000,
      dataQuality: { collectors: [], missingSources: [], failedSources: [] },
    });

    expect(result.levels['BTCUSDT']).toEqual(levels['BTCUSDT']);
  });

  it('passes derivativesContext through unchanged', () => {
    const derivativesContext: Record<string, DerivativesContext> = {
      BTCUSDT: {
        symbol: 'BTCUSDT',
        fundingStatus: 'positive_elevated',
        oiStatus: 'rising',
        positioningStatus: 'long_heavy',
      },
    };
    const result = builder.build({
      session: 'ASIA_CRYPTO',
      symbols: baseSymbols,
      marketSnapshots: [],
      derivativesContext,
      events: [],
      activeSetups: [],
      sessionContext: null,
      levels: {},
      tokenBudget: 100_000,
      dataQuality: { collectors: [], missingSources: [], failedSources: [] },
    });

    expect(result.derivativesContext['BTCUSDT']).toEqual(derivativesContext['BTCUSDT']);
  });

  it('passes activeSetups through unchanged', () => {
    const activeSetups: ActiveOverviewSetup[] = [
      { setupId: 's1', symbol: 'BTCUSDT', direction: 'LONG' as const, setupType: 'OB', timeframeSource: 'Daily' as const, status: 'WATCHING' },
    ];
    const result = builder.build({
      session: 'US_CRYPTO',
      symbols: baseSymbols,
      marketSnapshots: [],
      derivativesContext: {},
      events: [],
      activeSetups,
      sessionContext: null,
      levels: {},
      tokenBudget: 100_000,
      dataQuality: { collectors: [], missingSources: [], failedSources: [] },
    });

    expect(result.activeSetups).toEqual(activeSetups);
  });

  it('sets btcTone to constructive when BTC price is above daily midpoint', () => {
    const btcSnapshot = makeSnapshot('BTCUSDT', 96000, 94000, 95500);
    const levels: Record<string, HtfLevelsSnapshot> = {
      BTCUSDT: makeBtcLevels(95000), // price 96000 > dailyMidpoint 95000, below previousWeekHigh 100000
    };
    const result = builder.build({
      session: 'ASIA_CRYPTO',
      symbols: baseSymbols,
      marketSnapshots: [btcSnapshot],
      derivativesContext: {},
      events: [],
      activeSetups: [],
      sessionContext: null,
      levels,
      tokenBudget: 100_000,
      dataQuality: { collectors: [], missingSources: [], failedSources: [] },
    });

    expect(result.marketContext.btcTone).toBe('constructive');
  });

  it('sets btcTone to bullish_breakout when BTC price is above previousWeekHigh', () => {
    const btcSnapshot = makeSnapshot('BTCUSDT', 101000, 99000, 100500);
    const levels: Record<string, HtfLevelsSnapshot> = {
      BTCUSDT: makeBtcLevels(95000, 100000, 80000), // price 101000 > previousWeekHigh 100000
    };
    const result = builder.build({
      session: 'ASIA_CRYPTO',
      symbols: baseSymbols,
      marketSnapshots: [btcSnapshot],
      derivativesContext: {},
      events: [],
      activeSetups: [],
      sessionContext: null,
      levels,
      tokenBudget: 100_000,
      dataQuality: { collectors: [], missingSources: [], failedSources: [] },
    });

    expect(result.marketContext.btcTone).toBe('bullish_breakout');
  });

  it('sets ethVsBtc to outperforming when ETH daily return > BTC daily return by more than 1%', () => {
    // BTC: open 100, close 101 → return +1%
    // ETH: open 100, close 103 → return +3% → diff = +2% > 1%
    const btcSnapshot = makeSnapshot('BTCUSDT', 101, 100, 101);
    const ethSnapshot = makeSnapshot('ETHUSDT', 103, 100, 103);
    const result = builder.build({
      session: 'EUROPE_CRYPTO',
      symbols: baseSymbols,
      marketSnapshots: [btcSnapshot, ethSnapshot],
      derivativesContext: {},
      events: [],
      activeSetups: [],
      sessionContext: null,
      levels: {},
      tokenBudget: 100_000,
      dataQuality: { collectors: [], missingSources: [], failedSources: [] },
    });

    expect(result.marketContext.ethVsBtc).toBe('outperforming');
  });

  it('sets ethVsBtc to underperforming when ETH lags BTC by more than 1%', () => {
    // BTC: open 100, close 103 → return +3%
    // ETH: open 100, close 101 → return +1% → diff = -2% < -1%
    const btcSnapshot = makeSnapshot('BTCUSDT', 103, 100, 103);
    const ethSnapshot = makeSnapshot('ETHUSDT', 101, 100, 101);
    const result = builder.build({
      session: 'US_CRYPTO',
      symbols: baseSymbols,
      marketSnapshots: [btcSnapshot, ethSnapshot],
      derivativesContext: {},
      events: [],
      activeSetups: [],
      sessionContext: null,
      levels: {},
      tokenBudget: 100_000,
      dataQuality: { collectors: [], missingSources: [], failedSources: [] },
    });

    expect(result.marketContext.ethVsBtc).toBe('underperforming');
  });

  it('truncates events when token budget is exceeded', () => {
    // Create many large events that will exceed a tiny budget
    const events = Array.from({ length: 50 }, (_, i) => makeEvent(`ev${i}`, i * 0.01));
    const result = builder.build({
      session: 'ASIA_CRYPTO',
      symbols: baseSymbols,
      marketSnapshots: [],
      derivativesContext: {},
      events,
      activeSetups: [],
      sessionContext: null,
      levels: {},
      tokenBudget: 10, // very small budget
      dataQuality: { collectors: [], missingSources: [], failedSources: [] },
    });

    // Should have truncated to fit budget
    expect(result.eventsForSession.length).toBeLessThan(events.length);
  });
});
