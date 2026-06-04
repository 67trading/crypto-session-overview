import type { HtfLevelsSnapshot, OverviewOutput } from './ports.js';
import type { SessionContext } from '../../core/src/index.js';
import { getSessionDisplay } from './session-display.js';
import { formatSessionLevelValue } from './session-levels-builder.js';

function fmt(value: number | undefined): string | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Number(value.toFixed(2)).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function buildDeterministicScenarios(
  levels: HtfLevelsSnapshot | undefined,
  fallback: OverviewOutput['scenarios'],
): OverviewOutput['scenarios'] {
  const dailyMidpoint = levels?.daily?.dailyMidpoint;
  const currentDayOpen = levels?.daily?.currentDayOpen;
  const supportLow = levels?.fourHour?.supportZone.low ?? levels?.fourHour?.lastSwingLow;
  const resistanceHigh = levels?.fourHour?.resistanceZone.high ?? levels?.fourHour?.lastSwingHigh;

  const reclaimLevel = fmt(dailyMidpoint ?? resistanceHigh);
  const rejectLevel = fmt(currentDayOpen ?? resistanceHigh);
  const chopLow = fmt(supportLow);
  const chopHigh = fmt(currentDayOpen ?? dailyMidpoint ?? resistanceHigh);

  return {
    reclaim: reclaimLevel !== undefined
      ? `Above ${reclaimLevel} → relief attempt.`
      : fallback.reclaim,
    rejection: rejectLevel !== undefined
      ? `Below ${rejectLevel} → pressure remains.`
      : fallback.rejection,
    chop: chopLow !== undefined && chopHigh !== undefined
      ? `${chopLow}–${chopHigh} → range/chop conditions.`
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

  const display = getSessionDisplay(sessionContext.currentSession);
  const currentOpen = sessionContext.currentSessionOpen;
  const reclaimValue = currentOpen !== undefined
    ? Math.max(previous.high, currentOpen)
    : previous.high;
  const reclaimLabel = currentOpen !== undefined && reclaimValue === currentOpen
    ? `${display.currentSessionLabel} session open`
    : `${display.previousSessionLabel} session high`;
  const rejectValue = currentOpen ?? previous.low;
  const rejectLabel = currentOpen !== undefined
    ? `${display.currentSessionLabel} session open`
    : `${display.previousSessionLabel} session low`;
  const chopHigh = currentOpen ?? previous.midpoint;

  return {
    reclaim: `Above ${formatSessionLevelValue(reclaimValue)} (${reclaimLabel}) → relief attempt.`,
    rejection: `Below ${formatSessionLevelValue(rejectValue)} (${rejectLabel}) → pressure remains.`,
    chop: `${formatSessionLevelValue(previous.low)}–${formatSessionLevelValue(chopHigh)} → range/chop conditions.`,
  };
}
