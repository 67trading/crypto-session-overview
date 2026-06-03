import type {
  AltsBreadthSummary,
  ConfidenceBreakdown,
  CrossMarketSummary,
  DataStatus,
  DerivativesNarrativeSummary,
  HtfLevelsSnapshot,
  OptionsContext,
  PrecomputedEvents,
  PrecomputedRegime,
} from './ports.js';

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function capLabel(label: ConfidenceBreakdown['label'], cap: ConfidenceBreakdown['label']): ConfidenceBreakdown['label'] {
  const rank: Record<ConfidenceBreakdown['label'], number> = { low: 0, medium: 1, high: 2 };
  return rank[label] > rank[cap] ? cap : label;
}

function labelFromScore(score: number): ConfidenceBreakdown['label'] {
  if (score >= 0.75) return 'high';
  if (score >= 0.5) return 'medium';
  return 'low';
}

function hasKnownOptionsExpiry(options: OptionsContext[] | undefined): boolean {
  const btc = options?.find((option) => option.symbol === 'BTC' || option.currency === 'BTC');
  if (btc === undefined) return false;
  return btc.expiryScope !== undefined
    && btc.expiryScope !== 'unknown'
    && btc.selectedMaxPain?.expiryDate !== undefined;
}

function hasAmbiguousEventTime(events: PrecomputedEvents): boolean {
  return events.upcomingEvents.some((event) =>
    event.displayTimeType === undefined
    || event.displayTimeType === 'detectedAt'
    || event.verificationStatus === 'ambiguous'
  );
}

function scoreSignal(regime: PrecomputedRegime, btcLevels: HtfLevelsSnapshot | undefined): number {
  if (regime.marketRegime === 'unknown') return 0.2;
  const hasDaily = btcLevels?.daily !== null && btcLevels?.daily !== undefined;
  const hasWeekly = btcLevels?.weekly !== null && btcLevels?.weekly !== undefined;
  const hasFourHour = btcLevels?.fourHour !== null && btcLevels?.fourHour !== undefined;
  return clamp01(0.35 + (hasDaily ? 0.2 : 0) + (hasWeekly ? 0.2 : 0) + (hasFourHour ? 0.2 : 0) + (regime.marketRegime.includes('short_heavy') || regime.marketRegime.includes('risk') ? 0.05 : 0));
}

export function computeReportConfidence(params: {
  precomputedRegime: PrecomputedRegime;
  dataStatus: DataStatus;
  btcLevels?: HtfLevelsSnapshot | undefined;
  derivativesNarrative: DerivativesNarrativeSummary;
  altsBreadth: AltsBreadthSummary;
  crossMarket: CrossMarketSummary;
  options?: OptionsContext[] | undefined;
  events: PrecomputedEvents;
}): ConfidenceBreakdown {
  const reasons: string[] = [];
  const signalClarity = scoreSignal(params.precomputedRegime, params.btcLevels);

  let dataCoverage = 0.35;
  if (params.dataStatus.price === 'fresh') dataCoverage += 0.25;
  if (params.dataStatus.derivatives === 'fresh') dataCoverage += 0.15;
  if (params.dataStatus.events === 'fresh') dataCoverage += 0.1;
  if (hasKnownOptionsExpiry(params.options)) dataCoverage += 0.1;
  dataCoverage = clamp01(dataCoverage);

  const derivativeCrossVenue = params.derivativesNarrative.sourceScope === 'cross_venue'
    && params.derivativesNarrative.verificationStatus === 'confirmed_cross_venue';
  const venueAgreement = derivativeCrossVenue ? 0.8 : 0.45;
  if (!derivativeCrossVenue) reasons.push('Derivatives are source-scoped, so high confidence is capped.');

  let ambiguityPenalty = 0;
  if (!hasKnownOptionsExpiry(params.options)) {
    ambiguityPenalty += 0.15;
    reasons.push('Options max-pain expiry scope is unclear or unavailable.');
  }
  if (hasAmbiguousEventTime(params.events)) {
    ambiguityPenalty += 0.15;
    reasons.push('At least one event uses detected/announced time rather than parsed effective time.');
  }
  if (params.altsBreadth.sourceScope === 'tracked_basket' && params.altsBreadth.rotationState === 'broad_rotation') {
    ambiguityPenalty += 0.1;
    reasons.push('Alt breadth is a tracked basket, not market-wide breadth.');
  }
  if (params.crossMarket.ethUsd24hLabel === 'weak' && params.crossMarket.ethBtc7dChangePct !== undefined && params.crossMarket.ethBtc7dChangePct > 0) {
    ambiguityPenalty += 0.05;
    reasons.push('ETH/BTC resilience conflicts with weak ETH/USD short-term performance.');
  }

  const finalScore = clamp01(
    0.4 * signalClarity
    + 0.3 * dataCoverage
    + 0.25 * venueAgreement
    - 0.2 * ambiguityPenalty,
  );

  let label = labelFromScore(finalScore);
  if (!derivativeCrossVenue) label = capLabel(label, 'medium');
  if (ambiguityPenalty >= 0.25) label = capLabel(label, 'medium');
  if (params.dataStatus.price !== 'fresh') label = capLabel(label, 'low');
  if (reasons.length === 0) reasons.push('Price, derivatives, options, and event metadata are aligned.');

  return {
    signalClarity: Number(signalClarity.toFixed(2)),
    dataCoverage: Number(dataCoverage.toFixed(2)),
    venueAgreement: Number(venueAgreement.toFixed(2)),
    ambiguityPenalty: Number(ambiguityPenalty.toFixed(2)),
    finalScore: Number(finalScore.toFixed(2)),
    label,
    reasons,
  };
}
