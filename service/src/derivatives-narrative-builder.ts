import type { DerivativesContext, DerivativesNarrativeSummary } from './ports.js';

export type { DerivativesNarrativeSummary } from './ports.js';

const FUNDING_LABELS: Record<DerivativesContext['fundingStatus'], string> = {
  negative_extreme: 'extreme negative',
  negative_elevated: 'negative elevated',
  neutral: 'neutral',
  positive_elevated: 'positive elevated',
  positive_extreme: 'extreme positive (overheated)',
  unknown: 'unknown',
};

const OI_LABELS: Record<DerivativesContext['oiStatus'], string> = {
  falling: 'falling',
  stable: 'stable',
  rising: 'rising',
  rising_fast: 'rising fast',
  unknown: 'unknown',
};

const POSITIONING_LABELS: Record<DerivativesContext['positioningStatus'], string> = {
  long_heavy: 'long-heavy',
  short_heavy: 'short-heavy',
  balanced: 'balanced',
  unknown: 'unknown',
};

function fmtSymbol(symbol: string): string {
  return symbol.replace(/USDT$/, '').replace(/USD$/, '');
}

function buildStatusNarrative(
  symbols: string[],
  getLabel: (ctx: DerivativesContext) => string,
  contexts: Record<string, DerivativesContext>,
): string {
  const entries = symbols
    .filter((s) => s in contexts && getLabel(contexts[s]!) !== 'unknown')
    .map((s) => ({ sym: fmtSymbol(s), label: getLabel(contexts[s]!) }));

  if (entries.length === 0) return 'data unavailable';

  const uniqueLabels = new Set(entries.map((e) => e.label));
  if (uniqueLabels.size === 1) {
    const label = entries[0]!.label;
    if (entries.length === 1) return `${label} on ${entries[0]!.sym}`;
    return `${label} across ${entries.map((e) => e.sym).join('/')}`;
  }

  return entries.map((e) => `${e.label} on ${e.sym}`).join(', ');
}

export function buildDerivativesNarrative(
  contexts: Record<string, DerivativesContext>,
  prioritySymbols: string[] = ['BTCUSDT', 'ETHUSDT'],
): DerivativesNarrativeSummary {
  const symbols = prioritySymbols.filter((s) => s in contexts);

  if (symbols.length === 0) {
    return {
      funding: 'data unavailable',
      oi: 'data unavailable',
      positioning: 'data unavailable',
    };
  }

  return {
    funding: buildStatusNarrative(symbols, (c) => FUNDING_LABELS[c.fundingStatus], contexts),
    oi: buildStatusNarrative(symbols, (c) => OI_LABELS[c.oiStatus], contexts),
    positioning: buildStatusNarrative(symbols, (c) => POSITIONING_LABELS[c.positioningStatus], contexts),
  };
}
