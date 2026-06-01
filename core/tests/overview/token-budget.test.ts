import { describe, it, expect } from 'vitest';
import { estimateTokenCount, truncateToTokenBudget } from '../../src/overview/token-budget.js';
import type { OverviewInput } from '../../src/overview/overview-input.types.js';
import type { NormalizedEvent } from '../../src/events/event.types.js';

function makeBaseInput(eventCount = 0, setupCount = 0): OverviewInput {
  const events: NormalizedEvent[] = Array.from({ length: eventCount }, (_, i) => ({
    eventId: `event-${i}`,
    eventType: 'fomc' as const,
    category: 'macro' as const,
    title: `Event ${i}`,
    detectedAt: '2024-01-15T14:00:00Z',
    importance: 'high' as const,
    sessionRelevance: [],
    source: 'test',
    summary: 'Test summary with some content to add size',
    confidence: 'medium' as const,
    dedupeKey: `src:event-${i}:2024-01-15`,
    relevanceScore: 1 - i * 0.05,
  }));

  return {
    request: {
      session: 'US_CRYPTO',
      createdAt: '2024-01-15T14:00:00Z',
      timezone: 'UTC',
      allowedTimeframes: ['Weekly', 'Daily', '4H', 'Session'],
      forbiddenTimeframes: ['1H', '15m', '5m'],
    },
    universe: {
      coreSymbols: ['BTCUSDT', 'ETHUSDT'],
      majorSymbols: ['SOLUSDT', 'BNBUSDT'],
      watchSymbols: [],
    },
    marketContext: {
      btcTone: 'bullish',
      ethVsBtc: 'slightly_outperforming',
    },
    levels: {},
    sessionContext: null,
    derivativesContext: {},
    eventsForSession: events,
    activeSetups: Array.from({ length: setupCount }, (_, i) => ({
      setupId: `setup-${i}`,
      symbol: 'BTCUSDT',
      direction: 'LONG' as const,
      setupType: 'RANGE_HIGH',
      timeframeSource: 'Daily' as const,
      status: 'active',
    })),
  };
}

describe('estimateTokenCount', () => {
  it('returns > 0 for a non-empty object', () => {
    const count = estimateTokenCount({ key: 'value', number: 42 });
    expect(count).toBeGreaterThan(0);
  });

  it('returns 0 for circular objects (caught by try/catch)', () => {
    const obj: Record<string, unknown> = {};
    obj['self'] = obj;
    expect(estimateTokenCount(obj)).toBe(0);
  });

  it('scales with size of input', () => {
    const small = estimateTokenCount({ a: 1 });
    const large = estimateTokenCount({ a: 'x'.repeat(1000) });
    expect(large).toBeGreaterThan(small);
  });
});

describe('truncateToTokenBudget', () => {
  it('returns input unchanged when under budget', () => {
    const input = makeBaseInput(2, 1);
    const budget = estimateTokenCount(input) + 1000;
    const result = truncateToTokenBudget(input, budget);
    expect(result.eventsForSession).toHaveLength(2);
    expect(result.activeSetups).toHaveLength(1);
  });

  it('truncates events when over budget', () => {
    const input = makeBaseInput(20, 0);
    const smallBudget = 10; // very small
    const result = truncateToTokenBudget(input, smallBudget);
    expect(result.eventsForSession.length).toBeLessThan(20);
  });

  it('preserves highest relevance events when truncating', () => {
    const input = makeBaseInput(10, 0);
    // Make budget that fits only a few events
    const tightBudget = estimateTokenCount({ ...input, eventsForSession: input.eventsForSession.slice(0, 3) }) + 50;
    const result = truncateToTokenBudget(input, tightBudget);
    if (result.eventsForSession.length > 0) {
      // First event should have highest relevance score
      const scores = result.eventsForSession.map((e) => e.relevanceScore);
      const maxScore = Math.max(...input.eventsForSession.map((e) => e.relevanceScore));
      expect(Math.max(...scores)).toBe(maxScore);
    }
  });

  it('produces output that fits within the budget', () => {
    const input = makeBaseInput(30, 5);
    const budget = 200;
    const result = truncateToTokenBudget(input, budget);
    expect(estimateTokenCount(result)).toBeLessThanOrEqual(budget);
  });
});
