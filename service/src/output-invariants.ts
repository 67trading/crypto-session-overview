import type { OverviewInput, OverviewOutput } from './ports.js';
import { PRODUCT_FOOTER_NOTE } from './presentation-contract.js';

// Mirrors rule 2 in the LLM system prompt — these are execution instructions,
// not market descriptions. Keep context terms like long-heavy / short-heavy allowed.
export const FORBIDDEN_PHRASES = [
  'buy here',
  'sell here',
  'go long',
  'go short',
  'open long',
  'open short',
  'enter at',
  'exit at',
  'take the trade',
  'take a position',
  'place a trade',
  'stop loss',
  'take profit',
  'position size',
  'use leverage',
  'buy above',
  'sell below',
  'long from',
  'short from',
] as const;

const FORBIDDEN_PATTERNS: readonly { label: string; pattern: RegExp }[] = [
  { label: 'risk X%', pattern: /\brisk\s+\d+(?:\.\d+)?\s*%/i },
  { label: 'risk X percent', pattern: /\brisk\s+\d+(?:\.\d+)?\s*percent\b/i },
];

export type ForbiddenPhrase = (typeof FORBIDDEN_PHRASES)[number];

function collectWrittenStrings(output: OverviewOutput): string[] {
  return [
    output.btc.summary,
    output.btc.position,
    ...output.btc.keyLevels,
    output.eth.summary,
    output.eth.vsbtc,
    ...output.eth.keyLevels,
    ...output.majorAssets.flatMap((a) => [a.summary, ...a.keyLevels]),
    output.alts.summary,
    output.alts.breadth,
    output.derivatives.summary,
    output.derivatives.funding,
    output.derivatives.oi,
    output.derivatives.positioning,
    output.liquidity?.immediateUpside,
    output.liquidity?.recoveryZone,
    output.liquidity?.largerUpsideMagnet,
    output.liquidity?.downsideVulnerability,
    ...(output.liquidity?.bullets ?? []),
    output.events.summary,
    ...output.events.upcoming.map((e) => e.title),
    output.scenarios.reclaim,
    output.scenarios.rejection,
    output.scenarios.chop,
    output.note,
    ...output.whatChanged,
  ].filter((value): value is string => typeof value === 'string');
}

function outputText(output: OverviewOutput): string {
  return collectWrittenStrings(output).join('\n').toLowerCase();
}

const PRIMARY_UNLOCK_SOURCE = 'mobula-unlocks';

function primaryUnlockSourceSucceeded(input: OverviewInput): boolean {
  return input.sourceHealth?.collectors.some((collector) =>
    collector.status === 'success'
    && (collector.name === PRIMARY_UNLOCK_SOURCE || collector.source === PRIMARY_UNLOCK_SOURCE)
  ) === true;
}

function hasEtfFlowSource(input: OverviewInput): boolean {
  return input.etfFlowContext?.sourceAvailable === true
    && (input.etfFlowContext.btcFlowUsd !== undefined || input.etfFlowContext.ethFlowUsd !== undefined);
}

function hasAssetEtfFlowSource(input: OverviewInput, asset: 'btc' | 'eth'): boolean {
  if (input.etfFlowContext?.sourceAvailable !== true) return false;
  return asset === 'btc'
    ? input.etfFlowContext.btcFlowUsd !== undefined
    : input.etfFlowContext.ethFlowUsd !== undefined;
}

function hasDeribitOptionsSource(input: OverviewInput): boolean {
  return (input.optionsContext?.length ?? 0) > 0
    && input.sourceHealth?.collectors.some((collector) =>
      (collector.name === 'deribit-options' || collector.source === 'deribit-options')
      && (collector.status === 'success' || collector.status === 'partial')
      && collector.itemCount > 0
    ) === true;
}

function hasLiquidationClusters(input: OverviewInput): boolean {
  return (input.liquidityContext?.clusters.length ?? 0) > 0;
}

function hasQuotaLimitedMacroSource(input: OverviewInput): boolean {
  return input.sourceHealth?.collectors.some((collector) =>
    (collector.name === 'fred-rates' || collector.source === 'fred-rates'
      || collector.name === 'boj-rates' || collector.source === 'boj-rates')
    && (collector.status === 'partial' || collector.status === 'skipped')
    && collector.reasonCode === 'ACCESS_LIMITED_QUOTA'
  ) === true;
}

export function scanForForbiddenPhrases(output: OverviewOutput): string[] {
  const violations: string[] = [];
  for (const str of collectWrittenStrings(output)) {
    const lower = str.toLowerCase();
    for (const phrase of FORBIDDEN_PHRASES) {
      if (lower.includes(phrase)) {
        violations.push(`"${phrase}" in: "${str.slice(0, 120)}"`);
      }
    }
    for (const { label, pattern } of FORBIDDEN_PATTERNS) {
      if (pattern.test(str)) {
        violations.push(`"${label}" in: "${str.slice(0, 120)}"`);
      }
    }
  }
  return violations;
}

// Hard violations block Telegram publishing; soft violations are logged only
export function hasHardViolations(output: OverviewOutput): boolean {
  if (scanForForbiddenPhrases(output).length > 0) return true;
  if (!output.liquidity?.bullets?.length) return true;
  if (!output.scenarios.reclaim || !output.scenarios.rejection || !output.scenarios.chop) return true;
  if (!output.note) return true;
  if (output.note !== PRODUCT_FOOTER_NOTE) return true;
  return false;
}

export function checkOutputInvariants(output: OverviewOutput): string[] {
  const violations: string[] = [];

  if (output.whatChanged.length < 1) violations.push('whatChanged must have at least 1 item');
  if (output.whatChanged.length > 8) violations.push('whatChanged must have at most 8 items');

  if (!output.liquidity?.bullets?.length) violations.push('liquidity.bullets must be non-empty');

  if (!output.scenarios.reclaim) violations.push('scenarios.reclaim must be non-empty');
  if (!output.scenarios.rejection) violations.push('scenarios.rejection must be non-empty');
  if (!output.scenarios.chop) violations.push('scenarios.chop must be non-empty');
  for (const [name, line] of Object.entries(output.scenarios)) {
    if (!/[.!?]$/.test(line.trim())) violations.push(`scenarios.${name} must be a complete sentence/line`);
  }

  if (!output.note) violations.push('note must be non-empty');
  if (output.note !== PRODUCT_FOOTER_NOTE) violations.push('note must match product footer contract');

  if (!output.briefId) violations.push('briefId must be non-empty');
  if (!output.generatedAtUtc) violations.push('generatedAtUtc must be non-empty');

  violations.push(...scanForForbiddenPhrases(output));

  return violations;
}

export function checkSourceAwareOutputInvariants(output: OverviewOutput, input: OverviewInput): string[] {
  const text = outputText(output);
  const violations: string[] = [];

  const mentionsEtfFlow = /\betf\b/.test(text) && /\b(flow|flows|inflow|inflows|outflow|outflows)\b/.test(text);
  if (mentionsEtfFlow && !hasEtfFlowSource(input)) {
    violations.push('ETF flow claims require a successful ETF flow source');
  }
  if (/\beth\b.{0,20}\betf\b.{0,40}\b(flow|flows|inflow|inflows|outflow|outflows)\b/.test(text)
    && !hasAssetEtfFlowSource(input, 'eth')) {
    violations.push('ETH ETF flow claims require successful ETH ETF flow data');
  }
  if (/\bbtc\b.{0,20}\betf\b.{0,40}\b(flow|flows|inflow|inflows|outflow|outflows)\b/.test(text)
    && !hasAssetEtfFlowSource(input, 'btc')) {
    violations.push('BTC ETF flow claims require successful BTC ETF flow data');
  }

  const saysNoUnlock = /\bno confirmed\b.{0,40}\b(token\s+)?unlocks?\b/.test(text)
    || /\bno\b\s+(?:confirmed\s+)?(?:single\s+)?(?:token\s+)?unlocks?\b(?:\s+(?:reported|scheduled|detected|found|within|for|in|this))?/.test(text)
    || /\bwithout\b\s+(?:confirmed\s+)?(?:token\s+)?unlocks?\b/.test(text);
  if (saysNoUnlock && !primaryUnlockSourceSucceeded(input)) {
    violations.push('Token unlock absence claims require successful mobula-unlocks primary source');
  }

  const proxyOnly = input.etfFlowContext?.isProxy === true;
  const exactFlowWording = /\betf\b.{0,40}\b(flow|flows|inflow|inflows|outflow|outflows)\b/.test(text);
  const proxyWording = /holdings proxy suggests/.test(text);
  if (proxyOnly && exactFlowWording && !proxyWording) {
    violations.push('Issuer proxy ETF context must use holdings proxy wording');
  }

  const strongMacroClaim = /\b(?:us\s+)?rates?\s+confirm(?:s|ed)?\b/.test(text)
    || /\bboj\s+confirm(?:s|ed)?\b/.test(text)
    || /\b(?:fed|fred)\s+(?:data|rates?)\s+confirm(?:s|ed)?\b/.test(text);
  if (strongMacroClaim && hasQuotaLimitedMacroSource(input)) {
    violations.push('Strong macro rates claims require complete FRED/BoJ source data');
  }

  const optionsClaim = /\b(?:deribit|options?|max pain|put\/call|implied vol|iv)\b/.test(text)
    && /\b(?:expiry|strike|magnet|max pain|put\/call|implied vol|iv|pinning|options? area)\b/.test(text);
  if (optionsClaim && !hasDeribitOptionsSource(input)) {
    violations.push('Options claims require successful Deribit options context');
  }
  if ((output.alts as { sourceScope?: string }).sourceScope === 'tracked_basket'
  ) {
    violations.push('Configured/tracked symbols cannot power production Alts breadth');
  }
  if ((output.alts as { sourceScope?: string; canRenderBroadLabel?: boolean }).sourceScope === 'broad_alt_perp_tape'
    && (output.alts as { canRenderBroadLabel?: boolean }).canRenderBroadLabel === false
    && output.alts.rotationState === 'broad_rotation') {
    violations.push('Cannot render broad Alts rotation when broad alt perp tape is unavailable');
  }
  if ((output.derivatives as { sourceScope?: string }).sourceScope === 'single_venue'
    && /\bcross-venue|across venues\b/i.test(`${output.derivatives.summary} ${output.derivatives.funding} ${output.derivatives.oi} ${output.derivatives.positioning}`)) {
    violations.push('Single-venue derivatives cannot be presented as cross-venue');
  }
  const nakedMaxPain = /\bmax pain\b/i.test(text)
    && !/\bderibit\b/i.test(text)
    && !/\b(?:expiry|front_expiry|weekly|monthly|scope unclear)\b/i.test(text);
  if (nakedMaxPain) {
    violations.push('Max pain references require expiry scope or explicit caveat');
  }
  const ambiguousEventShownAsEffective = output.events.upcoming.some((event) => {
    const meta = event as { displayTimeType?: string; detail?: string };
    return (meta.displayTimeType === 'detectedAt' || meta.displayTimeType === 'publishedAt')
      && meta.detail?.toLowerCase().includes('effective:') === true;
  });
  if (ambiguousEventShownAsEffective) {
    violations.push('Detected/published event timestamps cannot be presented as effective event time');
  }

  const noConfirmedClusterWording = /\bno confirmed\b.{0,40}\bliquidation clusters?\b/.test(text);
  const exactClusterClaim = !noConfirmedClusterWording && /\b(?:nearest|large|major|exact|confirmed)\b.{0,40}\bliquidation clusters?\b/.test(text)
    || /\bliquidation clusters?\b.{0,40}\b(?:above|below|at|near|around)\s+\$?\d/.test(text)
    || /\bliquidation heatmap shows\b/.test(text);
  if (exactClusterClaim && !hasLiquidationClusters(input)) {
    violations.push('Exact liquidation cluster claims require confirmed liquidity cluster data');
  }

  return violations;
}
