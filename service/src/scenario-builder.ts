import type { HtfLevelsSnapshot, OverviewOutput } from './ports.js';
import type { SessionContext } from '../../core/src/index.js';
import { getSessionDisplay } from './session-display.js';
import { buildSessionLevelsPresentation, formatSessionLevelValue } from './session-levels-builder.js';

export function buildDeterministicScenarios(
  levels: HtfLevelsSnapshot | undefined,
  fallback: OverviewOutput['scenarios'],
): OverviewOutput['scenarios'] {
  const dailyMidpoint = levels?.daily?.dailyMidpoint;
  const currentDayOpen = levels?.daily?.currentDayOpen;
  const supportLow = levels?.fourHour?.supportZone.low ?? levels?.fourHour?.lastSwingLow;
  const resistanceHigh = levels?.fourHour?.resistanceZone.high ?? levels?.fourHour?.lastSwingHigh;

  const reclaimLevel = dailyMidpoint ?? resistanceHigh;
  const rejectLevel = currentDayOpen ?? resistanceHigh;
  const rawChopLow = supportLow;
  const rawChopHigh = currentDayOpen ?? dailyMidpoint ?? resistanceHigh;
  const chopLow = rawChopLow !== undefined && rawChopHigh !== undefined ? Math.min(rawChopLow, rawChopHigh) : undefined;
  const chopHigh = rawChopLow !== undefined && rawChopHigh !== undefined ? Math.max(rawChopLow, rawChopHigh) : undefined;

  return {
    reclaim: reclaimLevel !== undefined
      ? `Above ${formatSessionLevelValue(reclaimLevel)} → relief attempt.`
      : fallback.reclaim,
    rejection: rejectLevel !== undefined
      ? `Below ${formatSessionLevelValue(rejectLevel)} → pressure remains.`
      : fallback.rejection,
    chop: chopLow !== undefined && chopHigh !== undefined
      ? `${formatSessionLevelValue(chopLow)}–${formatSessionLevelValue(chopHigh)} → range/chop conditions.`
      : fallback.chop,
  };
}

export function buildSessionAwareScenarios(params: {
  sessionContext: SessionContext | null | undefined;
  fallbackHtfLevels: HtfLevelsSnapshot | undefined;
  fallback: OverviewOutput['scenarios'];
}): OverviewOutput['scenarios'] {
  const sessionContext = params.sessionContext;
  if (sessionContext === null || sessionContext === undefined) {
    return buildDeterministicScenarios(params.fallbackHtfLevels, params.fallback);
  }
  const previous = sessionContext.previousSessionHighLow;
  if (previous === undefined) {
    return buildDeterministicScenarios(params.fallbackHtfLevels, params.fallback);
  }

  const levels = buildSessionLevelsPresentation(sessionContext);
  if (levels?.reclaim === undefined || levels.vulnerability === undefined) {
    return buildDeterministicScenarios(params.fallbackHtfLevels, params.fallback);
  }
  const display = getSessionDisplay(sessionContext.currentSession);
  const currentOpen = sessionContext.currentSessionOpen;
  const rejectLevel = sessionContext.currentSessionOpenStatus === 'confirmed' && currentOpen !== undefined
    ? { value: currentOpen, label: `${display.currentSessionLabel} session open` }
    : levels.vulnerability;
  const rawChopHigh = sessionContext.currentSessionOpenStatus === 'confirmed' && currentOpen !== undefined
    ? currentOpen
    : previous.midpoint;
  const chopLow = Math.min(previous.low, rawChopHigh);
  const chopHigh = Math.max(previous.low, rawChopHigh);

  return {
    reclaim: `Above ${formatSessionLevelValue(levels.reclaim.value)} (${levels.reclaim.label}) → relief attempt.`,
    rejection: `Below ${formatSessionLevelValue(rejectLevel.value)} (${rejectLevel.label}) → pressure remains.`,
    chop: `${formatSessionLevelValue(chopLow)}–${formatSessionLevelValue(chopHigh)} → range/chop conditions.`,
  };
}
