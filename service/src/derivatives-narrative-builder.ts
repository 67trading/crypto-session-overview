import type { DerivativesConsensus, DerivativesContext, DerivativesNarrativeSummary } from './ports.js';

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

function presentWithoutChangeVenues(consensus: DerivativesConsensus): string[] {
  return consensus.openInterest.perVenue
    .filter((row) => row.reason === 'OI present without change window')
    .map((row) => row.venue.toUpperCase());
}

export function buildDerivativesNarrative(
  contexts: Record<string, DerivativesContext>,
  prioritySymbols: string[] = ['BTCUSDT', 'ETHUSDT'],
  consensus?: DerivativesConsensus,
): DerivativesNarrativeSummary {
  if (consensus !== undefined && consensus.combinedLabel !== 'unavailable') {
    const fundingVenues = consensus.funding.venuesAvailable.length;
    const oiVenues = consensus.openInterest.venuesAvailable.length;
    const fundingLabel = consensus.funding.direction === 'mixed'
      ? consensus.funding.perVenue.map((row) => `${row.venue} ${row.direction}`).join(', ')
      : `${consensus.funding.direction} on ${fundingVenues}/${consensus.funding.venuesRequired.length} venues`;
    const oiLabel = consensus.openInterest.direction === 'mixed'
      ? consensus.openInterest.perVenue.map((row) => `${row.venue} ${row.direction}`).join(', ')
      : `${consensus.openInterest.direction} on ${oiVenues}/${consensus.openInterest.venuesRequired.length} venues`;
    const presentOnlyOi = presentWithoutChangeVenues(consensus);
    const oiWithCoverageNote = presentOnlyOi.length > 0
      ? `${oiLabel}; OI present without change window on ${presentOnlyOi.join('/')}`
      : oiLabel;
    return {
      funding: fundingLabel,
      oi: oiWithCoverageNote,
      positioning: consensus.combinedLabel === 'mixed'
        ? 'mixed/incomplete cross-venue derivatives read'
        : 'no venue-confirmed stress signal',
      sourceScope: consensus.funding.verificationStatus === 'confirmed_cross_venue' || consensus.openInterest.verificationStatus === 'confirmed_cross_venue'
        ? 'cross_venue'
        : 'single_venue',
      venuesAvailable: [...new Set([...consensus.funding.venuesAvailable, ...consensus.openInterest.venuesAvailable])],
      verificationStatus: consensus.funding.verificationStatus === 'confirmed_cross_venue' && consensus.openInterest.verificationStatus === 'confirmed_cross_venue'
        ? 'confirmed_cross_venue'
        : consensus.funding.verificationStatus === 'ambiguous' || consensus.openInterest.verificationStatus === 'ambiguous'
        ? 'ambiguous'
        : 'source_scoped',
      positioningBasis: 'funding_and_oi',
    };
  }

  const symbols = prioritySymbols.filter((s) => s in contexts);

  if (symbols.length === 0) {
    return {
    funding: 'data unavailable',
    oi: 'data unavailable',
    positioning: 'data unavailable',
    sourceScope: 'unknown',
    venuesAvailable: [],
    verificationStatus: 'unavailable',
    positioningBasis: 'unknown',
    };
  }

  return {
    funding: buildStatusNarrative(symbols, (c) => FUNDING_LABELS[c.fundingStatus], contexts),
    oi: buildStatusNarrative(symbols, (c) => OI_LABELS[c.oiStatus], contexts),
    positioning: buildStatusNarrative(symbols, (c) => POSITIONING_LABELS[c.positioningStatus], contexts),
    sourceScope: 'single_venue',
    venuesAvailable: ['bybit'],
    verificationStatus: 'source_scoped',
    positioningBasis: 'funding_only',
  };
}
