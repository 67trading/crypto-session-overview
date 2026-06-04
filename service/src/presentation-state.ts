import type { OverviewOutput } from './ports.js';

type AltsMeta = OverviewOutput['alts'] & {
  sourceScope?: string;
  canRenderBroadLabel?: boolean;
  universeName?: string;
  minVolumeUsd?: number;
};

type DerivativesMeta = OverviewOutput['derivatives'] & {
  sourceScope?: string;
  verificationStatus?: string;
};

type EventWithPresentation = OverviewOutput['events']['upcoming'][number] & {
  displayTimeType?: string;
  detail?: string;
  verificationStatus?: string;
};

type OutputWithPresentation = OverviewOutput & {
  coverage?: { summary: string };
};

export type AltsPresentation = {
  marker: string;
  header: string;
  rotation: string;
  scope: string;
};

export type DerivativesPresentation = {
  marker: string;
  header: string;
};

export type PresentationLabels = {
  alts: AltsPresentation;
  derivatives: DerivativesPresentation;
  confidenceReason: string | undefined;
};

export function marketMarker(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized.includes('liquidation') || normalized.includes('stress') || normalized.includes('extreme') || normalized.includes('heavy') || normalized.includes('crowded')) return '⚫';
  if (normalized.includes('bull') || normalized.includes('risk_on') || normalized.includes('constructive') || normalized.includes('improving')) return '🟢';
  if (normalized.includes('bear') || normalized.includes('risk_off') || normalized.includes('defensive') || normalized.includes('weak') || normalized.includes('short_heavy')) return '🔴';
  if (normalized.includes('mixed') || normalized.includes('transition') || normalized.includes('range') || normalized.includes('selective')) return '🟡';
  return '⚪';
}

function parseBreadthPercent(text: string): number | undefined {
  const match = text.match(/(\d+(?:\.\d+)?)%/);
  if (match === null) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

function containsAny(text: string, terms: readonly string[]): boolean {
  const normalized = text.toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

function hasFundingNegativeSignal(text: string): boolean {
  return /\bnegative\b|\bbearish\b|\bshort[-\s]?(heavy|pressure|bias|positioning)\b/i.test(text);
}

function derivativeText(output: OverviewOutput): string {
  return `${output.derivatives.funding} ${output.derivatives.oi} ${output.derivatives.positioning}`;
}

export function formatBroadAltPerpRotation(output: OverviewOutput): string {
  const pct = parseBreadthPercent(output.alts.breadth);
  if (pct === undefined) {
    if (output.alts.rotationState === 'broad_rotation') return 'broad rotation';
    if (output.alts.rotationState === 'selective_rotation') return 'mixed';
    if (output.alts.rotationState === 'weak' || output.alts.rotationState === 'no_rotation') return 'broad perp weakness';
    return output.alts.rotationState.replace(/_/g, ' ');
  }
  if (pct <= 25) return 'broad perp weakness';
  if (pct < 45) return 'weak/mixed';
  if (pct < 60) return 'mixed';
  if (pct < 65) return 'selective rotation';
  return 'broad rotation';
}

export function formatAltRotation(output: OverviewOutput): string {
  const altsMeta = output.alts as AltsMeta;
  if (altsMeta.sourceScope === 'broad_alt_perp_tape') {
    if (altsMeta.canRenderBroadLabel === false || output.alts.rotationState === 'unknown') return 'unavailable';
    return formatBroadAltPerpRotation(output);
  }
  if (altsMeta.sourceScope === 'tracked_basket') return 'unavailable';
  return output.alts.rotationState.replace(/_/g, ' ');
}

export function formatAltScope(output: OverviewOutput): string {
  const altsMeta = output.alts as AltsMeta;
  if (altsMeta.sourceScope === 'broad_alt_perp_tape') {
    return altsMeta.universeName ?? 'Bybit/Binance/OKX liquid USDT perp tape';
  }
  if (altsMeta.sourceScope === 'market_wide_top_n') return 'market-cap universe';
  return 'broad alt perp tape unavailable; configured symbols are not used for production Alts breadth';
}

export function buildAltsPresentation(output: OverviewOutput): AltsPresentation {
  const altsMeta = output.alts as AltsMeta;
  const rotation = formatAltRotation(output);
  const header = altsMeta.sourceScope === 'broad_alt_perp_tape' && altsMeta.canRenderBroadLabel !== false && output.alts.rotationState !== 'unknown'
    ? rotation
    : altsMeta.sourceScope === 'broad_alt_perp_tape'
    ? 'unavailable'
    : altsMeta.sourceScope === 'tracked_basket'
    ? 'unavailable'
    : rotation;

  if (altsMeta.sourceScope !== 'broad_alt_perp_tape' || altsMeta.canRenderBroadLabel === false || output.alts.rotationState === 'unknown') {
    return {
      marker: marketMarker(`${output.alts.rotationState} ${output.alts.breadth}`),
      header,
      rotation,
      scope: formatAltScope(output),
    };
  }

  const pct = parseBreadthPercent(output.alts.breadth);
  if (pct === undefined) {
    return {
      marker: marketMarker(`${output.alts.rotationState} ${output.alts.breadth}`),
      header,
      rotation,
      scope: formatAltScope(output),
    };
  }

  const marker = pct <= 25 ? '🔴' : pct < 60 ? '🟡' : pct < 65 ? '⚪' : '🟢';
  return { marker, header, rotation, scope: formatAltScope(output) };
}

export function buildDerivativesPresentation(output: OverviewOutput): DerivativesPresentation {
  const derivativesMeta = output.derivatives as DerivativesMeta;
  const allText = derivativeText(output);
  const fundingText = output.derivatives.funding.toLowerCase();
  const oiText = output.derivatives.oi.toLowerCase();
  const positioningText = output.derivatives.positioning.toLowerCase();
  const isMixed = derivativesMeta.verificationStatus === 'ambiguous' || containsAny(allText, ['mixed', 'conflict', 'diverg']);
  const isStress = containsAny(allText, ['liquidation', 'stress', 'extreme', 'heavy', 'crowded']);
  const oiRising = containsAny(oiText, ['rising', 'increase', 'building', 'bullish']);
  const oiFalling = containsAny(oiText, ['falling', 'decreas', 'declin', 'bearish']);
  const fundingPositive = containsAny(fundingText, ['positive', 'elevated', 'bullish']);
  const fundingNegative = hasFundingNegativeSignal(fundingText);
  const fundingNeutral = fundingText.includes('neutral');
  const oiNeutral = oiText.includes('neutral') || oiText.includes('stable');
  const positioningNeutral = containsAny(positioningText, ['neutral', 'balanced', 'no venue-confirmed stress']);
  const positioningMarker = marketMarker(output.derivatives.positioning);

  if (derivativesMeta.sourceScope === 'single_venue') {
    return { marker: '⚪', header: 'source-scoped' };
  }

  if (derivativesMeta.sourceScope === 'cross_venue' && derivativesMeta.verificationStatus !== 'confirmed_cross_venue') {
    if (isMixed) return { marker: '🟡', header: 'mixed derivatives' };
    return { marker: '🟡', header: 'funding confirmed, OI incomplete' };
  }

  if (derivativesMeta.sourceScope === 'cross_venue' && derivativesMeta.verificationStatus === 'confirmed_cross_venue') {
    if (isStress) return { marker: '⚫', header: 'cross-venue stress' };
    if (fundingPositive && oiRising) return { marker: '🔴', header: 'leverage building' };
    if (fundingNegative && oiRising) return { marker: '🔴', header: 'short pressure building' };
    if (fundingNeutral && oiFalling) return { marker: '⚪', header: 'deleveraging' };
    if (isMixed) return { marker: '🟡', header: 'mixed derivatives' };
    if (fundingNeutral && (oiNeutral || positioningNeutral)) return { marker: '⚪', header: 'cross-venue neutral' };
    return { marker: marketMarker(output.derivatives.positioning), header: 'cross-venue derivatives' };
  }

  if (positioningMarker !== '⚪') return { marker: positioningMarker, header: 'positioning' };
  if (positioningNeutral || fundingNeutral || oiNeutral) return { marker: '⚪', header: 'neutral' };
  return { marker: positioningMarker, header: 'positioning' };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function coverageFraction(summary: string | undefined, label: string): { available: number; required: number } | undefined {
  if (summary === undefined) return undefined;
  const match = summary.match(new RegExp(`${escapeRegExp(label)}\\s+(\\d+)\\/(\\d+)`, 'i'));
  if (match === null) return undefined;
  const available = Number(match[1]);
  const required = Number(match[2]);
  return Number.isFinite(available) && Number.isFinite(required) ? { available, required } : undefined;
}

function hasAnnouncementOnlyEvent(output: OverviewOutput): boolean {
  return output.events.upcoming.some((event) => {
    const ev = event as EventWithPresentation;
    return ev.verificationStatus === 'ambiguous' || ev.displayTimeType === 'publishedAt' || ev.displayTimeType === 'detectedAt';
  });
}

function hasOptionsScopeIssue(output: OverviewOutput): boolean {
  const liquidityText = [
    output.liquidity.immediateUpside,
    output.liquidity.recoveryZone,
    output.liquidity.largerUpsideMagnet,
    output.liquidity.downsideVulnerability,
    ...output.liquidity.bullets,
  ].filter((value): value is string => value !== undefined).join(' ');
  return containsAny(liquidityText, ['expiry scope unclear', 'expiry missing', 'unknown expiry']);
}

function hasEthConflict(output: OverviewOutput): boolean {
  const ethMeta = output.eth as OverviewOutput['eth'] & { headerLabel?: string; ethUsd24hLabel?: string };
  const ethBtcResilient = containsAny(`${ethMeta.headerLabel ?? ''} ${output.eth.vsbtc}`, ['eth/btc', 'resilience', 'rising', 'gaining']);
  return ethBtcResilient && ethMeta.ethUsd24hLabel === 'weak';
}

function hasBtcAltsDivergence(output: OverviewOutput): boolean {
  const altsMeta = output.alts as AltsMeta;
  if (altsMeta.sourceScope !== 'broad_alt_perp_tape' || altsMeta.canRenderBroadLabel === false) return false;
  const alts = buildAltsPresentation(output);
  const btcWeak = containsAny(`${output.btc.structure} ${output.btc.summary} ${output.btc.position} ${output.marketRegime}`, ['bear', 'defensive', 'weak', 'breakdown']);
  return btcWeak && alts.header === 'broad rotation';
}

export function formatConfidenceReason(output: OverviewOutput): string | undefined {
  const outputMeta = output as OutputWithPresentation;
  const firstReason = output.confidenceBreakdown?.reasons[0];
  const priceCoverage = coverageFraction(outputMeta.coverage?.summary, 'Core price');
  if (priceCoverage !== undefined && priceCoverage.available < priceCoverage.required) {
    return 'Core price coverage is incomplete, so confidence is capped.';
  }

  const derivativesMeta = output.derivatives as DerivativesMeta;
  const derivativesPresentation = buildDerivativesPresentation(output);
  if (derivativesMeta.sourceScope === 'single_venue') {
    return 'Derivatives are source-scoped, so high confidence is capped.';
  }
  if (derivativesMeta.sourceScope === 'cross_venue' && derivativesMeta.verificationStatus !== 'confirmed_cross_venue') {
    if (derivativesPresentation.header === 'mixed derivatives') {
      return 'Derivatives venues disagree; OI trend is mixed/incomplete.';
    }
    return 'OI trend coverage is incomplete, so high confidence is capped.';
  }

  if (hasAnnouncementOnlyEvent(output)) return 'Event timing is announcement-only, so confidence is capped.';
  if (hasOptionsScopeIssue(output)) return 'Options expiry scope is unclear, so confidence is capped.';
  if (hasEthConflict(output)) return 'ETH/BTC resilience conflicts with ETH/USD weakness, so confidence remains medium.';
  if (hasBtcAltsDivergence(output)) return 'BTC is weak while broad alt breadth diverges positively, so confidence remains medium.';

  const fundingCoverage = coverageFraction(outputMeta.coverage?.summary, 'Funding');
  const oiCoverage = coverageFraction(outputMeta.coverage?.summary, 'OI');
  if (
    output.briefConfidence === 'high'
    && priceCoverage !== undefined
    && fundingCoverage !== undefined
    && oiCoverage !== undefined
    && priceCoverage.available === priceCoverage.required
    && fundingCoverage.available === fundingCoverage.required
    && oiCoverage.available === oiCoverage.required
    && derivativesMeta.verificationStatus === 'confirmed_cross_venue'
  ) {
    return 'Core price and derivatives confirm across venues.';
  }

  if (containsAny(`${output.marketRegime} ${output.btc.structure} ${output.btc.summary}`, ['range-bound', 'range bound', 'range_compression', 'defensive_range_bound']) && firstReason === undefined) {
    return 'BTC structure is range-bound, so confidence remains medium.';
  }

  return firstReason;
}

export function formatDerivativesOi(oi: string): string {
  const match = oi.match(/^(.*?);\s*OI present without change window on (.+)$/i);
  if (match !== null) {
    return `${match[1]}; ${match[2]} has present OI only, no change window`;
  }
  return oi;
}

function formatEventDetail(detail: string): string {
  if (detail === 'Effective time not parsed.') return 'Effective/trading-end time not parsed.';
  return detail;
}

function isListingEvent(title: string): boolean {
  return /\b(listing|list|launch)\b/i.test(title) && !/\bdelist/i.test(title);
}

function isDelistingEvent(title: string): boolean {
  return /\bdelist/i.test(title);
}

export function formatEventDetailForTitle(detail: string, title: string): string {
  if (detail === 'Effective time not parsed.') {
    if (isDelistingEvent(title)) return 'Trading-end/effective time not parsed.';
    if (isListingEvent(title)) return 'Trading start/effective time not parsed.';
  }
  return formatEventDetail(detail);
}

export function formatEventTitleForTelegram(title: string): string {
  return title
    .replace(/,\s*with up to \d+x leverage\b/ig, '')
    .replace(/\s+with up to \d+x leverage\b/ig, '')
    .replace(/\s+-\s+up to \d+x leverage\b/ig, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function eventMarker(importance: string): string {
  if (importance === 'critical' || importance === 'high') return '🔴';
  if (importance === 'medium') return '🟠';
  if (importance === 'low') return '🔵';
  return '⚪';
}

export function eventTimePrefix(displayTimeType: string | undefined): string {
  if (displayTimeType === 'tradingEndsAt') return 'trading ends';
  if (displayTimeType === 'effectiveAt') return 'effective';
  if (displayTimeType === 'publishedAt') return 'announced';
  if (displayTimeType === 'detectedAt') return 'detected';
  return '';
}

export function btcLevelLabel(level: string, index: number): string {
  if (index === 0 && /\b(previous week|weekly|previous month|monthly|HTF)\b/i.test(level)) return 'Major recovery/ref';
  return index === 0 ? 'Recovery/ref' : 'Resistance/ref';
}

export function buildPresentationLabels(output: OverviewOutput): PresentationLabels {
  return {
    alts: buildAltsPresentation(output),
    derivatives: buildDerivativesPresentation(output),
    confidenceReason: formatConfidenceReason(output),
  };
}
