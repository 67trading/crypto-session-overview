import { describe, expect, it } from 'vitest';
import { buildSessionAwareScenarios } from '../src/scenario-builder.js';
import type { SessionContext } from '../../core/src/index.js';

const fallback = {
  reclaim: 'LLM reclaim.',
  rejection: 'LLM rejection.',
  chop: 'LLM chop.',
};

function makeContext(session: SessionContext['currentSession']): SessionContext {
  return {
    currentSession: session,
    previousSessionHighLow: {
      session: session === 'ASIA_CRYPTO' ? 'US_CRYPTO' : session === 'EUROPE_CRYPTO' ? 'ASIA_CRYPTO' : 'EUROPE_CRYPTO',
      high: 65_812.15,
      low: 61_185.89,
      midpoint: 63_407.07,
      open: 62_000,
      close: 64_146,
    },
    currentSessionOpen: 64_146,
    currentSessionOpenStatus: 'confirmed',
  };
}

describe('buildSessionAwareScenarios()', () => {
  it('uses previous/current session handoff levels for Asia', () => {
    const scenarios = buildSessionAwareScenarios({
      sessionContext: makeContext('ASIA_CRYPTO'),
      fallbackHtfLevels: undefined,
      fallback,
    });

    expect(scenarios.reclaim).toBe('Above 65,812.15 (US session high) → relief attempt.');
    expect(scenarios.rejection).toBe('Below 64,146 (Asia session open) → pressure remains.');
    expect(scenarios.chop).toBe('61,185.89–64,146 → range/chop conditions.');
  });

  it('uses Europe and US labels for their handoff scenarios', () => {
    expect(buildSessionAwareScenarios({
      sessionContext: makeContext('EUROPE_CRYPTO'),
      fallbackHtfLevels: undefined,
      fallback,
    }).reclaim).toContain('(Asia session high)');
    expect(buildSessionAwareScenarios({
      sessionContext: makeContext('US_CRYPTO'),
      fallbackHtfLevels: undefined,
      fallback,
    }).rejection).toContain('(US session open)');
  });

  it('falls back to HTF deterministic scenarios without session context', () => {
    const scenarios = buildSessionAwareScenarios({
      sessionContext: null,
      fallbackHtfLevels: {
        weekly: null,
        daily: {
          currentDayOpen: 64_146,
          previousDayHigh: 66_000,
          previousDayLow: 61_000,
          previousDayClose: 64_000,
          dailyMidpoint: 63_500,
          dailyPosition: 'above_midpoint',
        },
        fourHour: null,
      },
      fallback,
    });

    expect(scenarios.reclaim).toBe('Above 63,500 → relief attempt.');
    expect(scenarios.rejection).toBe('Below 64,146 → pressure remains.');
  });
});
