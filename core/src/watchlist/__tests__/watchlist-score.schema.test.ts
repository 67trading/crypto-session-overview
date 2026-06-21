import { describe, expect, it } from 'vitest';
import {
  WATCHLIST_SCORE_WEIGHTS,
  WATCHLIST_TIER_THRESHOLDS,
  WatchlistComponentScoreSchema,
  WatchlistScoreWeightsSchema,
} from '../index.js';

describe('watchlist score schemas', () => {
  it('defines the expected production MVP score weights', () => {
    expect(WATCHLIST_SCORE_WEIGHTS).toEqual({
      liquidity: 20,
      volatility: 15,
      relativeStrength: 20,
      sectorStrength: 15,
      catalystQuality: 10,
      technicalStructure: 15,
      riskDataQuality: 5,
    });

    expect(WatchlistScoreWeightsSchema.parse(WATCHLIST_SCORE_WEIGHTS)).toEqual(
      WATCHLIST_SCORE_WEIGHTS,
    );
  });

  it('weights sum to 100', () => {
    const total = Object.values(WATCHLIST_SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });

  it('defines the expected tier thresholds', () => {
    expect(WATCHLIST_TIER_THRESHOLDS).toEqual({
      aListMin: 80,
      bListMin: 65,
      candidatePoolMin: 50,
    });
  });

  it('rejects component scores above 100', () => {
    expect(() =>
      WatchlistComponentScoreSchema.parse({
        score: 101,
        weight: 20,
        contribution: 20,
        evidence: [],
        flags: [],
        metrics: {},
      }),
    ).toThrow();
  });

  it('rejects negative component scores', () => {
    expect(() =>
      WatchlistComponentScoreSchema.parse({
        score: -1,
        weight: 20,
        contribution: 0,
        evidence: [],
        flags: [],
        metrics: {},
      }),
    ).toThrow();
  });

  it('accepts valid component score at boundaries', () => {
    const parsed = WatchlistComponentScoreSchema.parse({
      score: 0,
      weight: 20,
      contribution: 0,
      evidence: ['no data'],
      flags: ['MISSING_DATA'],
      metrics: { volume: null },
    });
    expect(parsed.score).toBe(0);
  });
});
