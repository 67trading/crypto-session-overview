import type { BtcPresentationContext, HtfLevelsSnapshot, OverviewOutput } from './ports.js';

type BtcTone = 'bullish_breakout' | 'bearish_breakdown' | 'constructive' | 'weak' | 'neutral' | 'unknown';

function normalizeTone(tone: string | undefined): BtcTone {
  if (
    tone === 'bullish_breakout'
    || tone === 'bearish_breakdown'
    || tone === 'constructive'
    || tone === 'weak'
    || tone === 'neutral'
  ) {
    return tone;
  }
  return 'unknown';
}

function fmt(value: number | undefined): string | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Number(value.toFixed(2)).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function formatLevel(value: number | undefined, reason: string): string | undefined {
  const formatted = fmt(value);
  return formatted !== undefined ? `${formatted} (${reason})` : undefined;
}

function midpointPositionLabel(position: 'above_midpoint' | 'at_midpoint' | 'below_midpoint' | null | undefined, label: 'daily' | 'weekly'): string | undefined {
  if (position === undefined || position === null) return undefined;
  if (position === 'at_midpoint') return `at ${label} midpoint`;
  return position === 'below_midpoint' ? `below ${label} midpoint` : `above ${label} midpoint`;
}

function sentenceCase(text: string): string {
  return text.length > 0 ? `${text[0]!.toUpperCase()}${text.slice(1)}` : text;
}

function buildPosition(levels: HtfLevelsSnapshot | undefined): string {
  const parts = [
    midpointPositionLabel(levels?.daily?.dailyPosition, 'daily'),
    midpointPositionLabel(levels?.weekly?.weeklyPosition, 'weekly'),
  ].filter((part): part is string => part !== undefined);
  if (parts.length === 0) return 'Deterministic BTC position unavailable.';
  const first = parts[0]!;
  if (parts.length === 1) return `${sentenceCase(first)}.`;
  return `${sentenceCase(first)} and ${parts[1]!}.`;
}

function deriveStructure(tone: BtcTone, fourHourStructure: OverviewOutput['btc']['structure']): OverviewOutput['btc']['structure'] {
  if (tone === 'bullish_breakout' || tone === 'constructive') return 'bullish';
  if (tone === 'bearish_breakdown' || tone === 'weak') return 'bearish';
  return fourHourStructure;
}

function deriveHeaderLabel(params: {
  tone: BtcTone;
  fourHourStructure: OverviewOutput['btc']['structure'];
  belowDaily: boolean;
  belowWeekly: boolean;
}): string {
  if (params.tone === 'bearish_breakdown') {
    return params.fourHourStructure === 'range' ? 'bearish near support' : 'bearish breakdown';
  }
  if (params.tone === 'weak' && params.belowDaily && params.belowWeekly) {
    return params.fourHourStructure === 'range' ? 'bearish range pressure' : 'bearish';
  }
  if (params.tone === 'weak') return 'defensive';
  if (params.tone === 'constructive') return 'constructive';
  if (params.tone === 'bullish_breakout') return 'bullish breakout';
  if (params.fourHourStructure === 'range') return 'neutral range';
  return params.fourHourStructure;
}

function buildSummary(headerLabel: string): string {
  switch (headerLabel) {
    case 'bearish near support':
      return 'BTC is below key higher-timeframe references while trading near support, keeping the session defensive.';
    case 'bearish breakdown':
      return 'BTC is trading below key higher-timeframe references, confirming a bearish breakdown tone.';
    case 'bearish range pressure':
      return 'BTC remains inside the 4H range, but below daily and weekly midpoints, leaving pressure to the downside.';
    case 'bearish':
    case 'defensive':
      return 'BTC is below the daily midpoint, keeping the session tone defensive.';
    case 'constructive':
      return 'BTC is trading above the daily midpoint, giving the session a constructive tone.';
    case 'bullish breakout':
      return 'BTC is trading above the previous weekly high, confirming a bullish breakout tone.';
    case 'neutral range':
      return 'BTC is trading inside the 4H range with no clean directional confirmation.';
    default:
      return 'BTC is trading near key reference levels with no clean directional confirmation.';
  }
}

function selectKeyLevels(tone: BtcTone, levels: HtfLevelsSnapshot | undefined): string[] {
  const weekly = levels?.weekly;
  const daily = levels?.daily;
  const fourHour = levels?.fourHour;
  const candidates = tone === 'bearish_breakdown' || tone === 'weak'
    ? [
        formatLevel(weekly?.previousWeekHigh, 'previous week high'),
        formatLevel(fourHour?.lastSwingHigh, '4H last swing high'),
        formatLevel(weekly?.weeklyMidpoint, 'weekly midpoint'),
        formatLevel(daily?.dailyMidpoint, 'daily midpoint'),
      ]
    : [
        formatLevel(daily?.dailyMidpoint, 'daily midpoint'),
        formatLevel(fourHour?.lastSwingHigh, '4H last swing high'),
        formatLevel(weekly?.previousWeekHigh, 'previous week high'),
        formatLevel(fourHour?.lastSwingLow, '4H last swing low'),
      ];
  return candidates.filter((level): level is string => level !== undefined).slice(0, 2);
}

export function buildBtcPresentationContext(params: {
  btcTone?: string;
  levels: HtfLevelsSnapshot | undefined;
  spotPrice?: number;
}): BtcPresentationContext {
  const tone = normalizeTone(params.btcTone);
  const fourHourStructure = params.levels?.fourHour?.structure ?? 'unknown';
  const belowDaily = params.levels?.daily?.dailyPosition === 'below_midpoint';
  const belowWeekly = params.levels?.weekly?.weeklyPosition === 'below_midpoint';
  const headerLabel = deriveHeaderLabel({ tone, fourHourStructure, belowDaily, belowWeekly });
  return {
    symbol: 'BTCUSDT',
    structure: deriveStructure(tone, fourHourStructure),
    headerLabel,
    position: buildPosition(params.levels),
    summary: buildSummary(headerLabel),
    keyLevelsDisplay: selectKeyLevels(tone, params.levels),
    ...(params.spotPrice !== undefined ? { spotPrice: params.spotPrice } : {}),
    source: 'deterministic_htf_levels',
  };
}

export function btcPresentationToOutput(context: BtcPresentationContext): OverviewOutput['btc'] {
  return {
    summary: context.summary,
    keyLevels: context.keyLevelsDisplay,
    position: context.position,
    structure: context.structure,
    headerLabel: context.headerLabel,
    ...(context.spotPrice !== undefined ? { spotPrice: context.spotPrice } : {}),
  };
}
