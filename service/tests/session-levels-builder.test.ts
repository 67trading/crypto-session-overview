import { describe, expect, it } from 'vitest';
import { buildSessionLevelsPresentation } from '../src/session-levels-builder.js';
import type { SessionContext } from '../../core/src/index.js';

function makeContext(overrides: Partial<SessionContext> = {}): SessionContext {
  return {
    currentSession: 'ASIA_CRYPTO',
    previousSessionHighLow: {
      session: 'US_CRYPTO',
      high: 65_812.15,
      low: 61_000,
      midpoint: 63_406.08,
      open: 62_000,
      close: 64_146,
    },
    currentSessionOpenStatus: 'confirmed',
    currentSessionOpen: 63_000,
    ...overrides,
  };
}

describe('buildSessionLevelsPresentation()', () => {
  it('uses previous session high as recovery/reclaim when current open is below that high', () => {
    const levels = buildSessionLevelsPresentation(makeContext());

    expect(levels?.recovery).toEqual({ value: 65_812.15, label: 'US session high' });
    expect(levels?.reclaim).toEqual(levels?.recovery);
    expect(levels?.resistance).toBeUndefined();
  });

  it('uses current session open as recovery/reclaim only when it is above previous high', () => {
    const levels = buildSessionLevelsPresentation(makeContext({ currentSessionOpen: 66_500 }));

    expect(levels?.recovery).toEqual({ value: 66_500, label: 'Asia session open' });
    expect(levels?.reclaim).toEqual(levels?.recovery);
    expect(levels?.resistance).toEqual({ value: 65_812.15, label: 'US session high' });
  });

  it('falls back to previous high when current open is unavailable', () => {
    const context = makeContext({
      currentSessionOpenStatus: 'unavailable',
    });
    delete context.currentSessionOpen;
    const levels = buildSessionLevelsPresentation(context);

    expect(levels?.recovery).toEqual({ value: 65_812.15, label: 'US session high' });
  });
});
