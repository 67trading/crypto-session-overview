import type { HtfLevelsSnapshot, OverviewOutput } from './ports.js';

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
