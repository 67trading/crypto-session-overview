import type { OverviewOutput } from './ports.js';
import {
  btcLevelLabel,
  buildPresentationLabels,
  eventMarker,
  eventTimePrefix,
  formatAltRotation,
  formatDerivativesOi,
  formatEventDetailForTitle,
  formatEventTitleForTelegram,
  marketMarker,
} from './presentation-state.js';
import { getSessionDisplay } from './session-display.js';

const TELEGRAM_MESSAGE_LIMIT = 4096;
const MAX_WHAT_CHANGED = 4;
const MAX_LIQUIDITY_LINES = 5;
const MAX_EVENTS = 5;
const MAX_SUMMARY_CHARS = 180;
const MAX_DETAIL_CHARS = 160;
const MAX_LEVELS_CHARS = 140;
const COMPACT_MESSAGE_LIMIT = 2800;
const COMPACT_DETAIL_CHARS = 120;
const COMPACT_SUMMARY_CHARS = 110;
const COMPACT_FOOTER_NOTE = 'Context only. No entries/exits/sizing/leverage.';
const HTML_COMPACT_MESSAGE_LIMIT = 2800;

const IMPORTANCE_SYMBOL: Record<string, string> = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '🔵',
};

function toUtcDatetime(utcIso: string): string {
  const date = new Date(utcIso);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date).replace(',', '');
}

function toLocalHHmm(utcIso: string, timeZone: string): string {
  const date = new Date(utcIso);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function compact(text: string, maxChars: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function compactComplete(text: string, maxChars: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;

  const slice = normalized.slice(0, maxChars).trimEnd();
  const boundary = Math.max(
    slice.lastIndexOf('.'),
    slice.lastIndexOf(';'),
    slice.lastIndexOf(','),
    slice.lastIndexOf(' · '),
  );
  if (boundary >= Math.floor(maxChars * 0.55)) return slice.slice(0, boundary + 1).trim();

  const wordBoundary = slice.lastIndexOf(' ');
  if (wordBoundary >= Math.floor(maxChars * 0.55)) return slice.slice(0, wordBoundary).trim();
  return slice.trim();
}

function compactSentence(text: string, maxChars: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;

  const slice = normalized.slice(0, maxChars).trimEnd();
  const boundary = Math.max(slice.lastIndexOf('.'), slice.lastIndexOf(';'));
  if (boundary >= Math.floor(maxChars * 0.55)) return slice.slice(0, boundary + 1).trim();

  const wordBoundary = slice.lastIndexOf(' ');
  const stem = wordBoundary >= Math.floor(maxChars * 0.55) ? slice.slice(0, wordBoundary).trim() : slice.trim();
  return stem.replace(/[,:;\s]+$/g, '') + '.';
}

function compactChangedBullet(text: string, maxChars: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const arrowMatch = normalized.match(/^(Alt breadth:)\s+(.+?)\s+→\s+(.+)$/);
  if (arrowMatch !== null) {
    const [, label, prev, curr] = arrowMatch;
    const prevShort = prev!.replace(/\s+on 24h$/i, '');
    const currShort = curr!.replace(/\s+on 24h$/i, '');
    const candidate = `${label} ${prevShort} → ${currShort}.`;
    if (candidate.length <= maxChars) return candidate;
  }
  if (normalized.length > maxChars) {
    const fieldChangeMatch = normalized.match(/^([^:]{1,40}):\s+.+\s+→\s+.+$/);
    if (fieldChangeMatch !== null) return `${fieldChangeMatch[1]} changed.`;
  }
  return compactSentence(normalized, maxChars);
}

function titleCaseSessionName(value: string): string {
  if (value.toUpperCase() === 'US') return 'US';
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function humanizeMarketLabel(text: string): string {
  return humanizeNumbers(text)
    .replace(/\bASIA_CRYPTO\b/g, 'Asia')
    .replace(/\bEUROPE_CRYPTO\b/g, 'Europe')
    .replace(/\bUS_CRYPTO\b/g, 'US')
    .replace(/\bprevious (ASIA|EUROPE|US) high\b/g, (_match, session: string) => `${titleCaseSessionName(session)} session high`)
    .replace(/\bprevious (ASIA|EUROPE|US) low\b/g, (_match, session: string) => `${titleCaseSessionName(session)} session low`)
    .replace(/\bfront_expiry\b/g, 'front expiry')
    .replace(/\bDaily Open \/ Current Session Open\b/g, 'daily / session open')
    .replace(/\bDaily Open\b/g, 'daily open')
    .replace(/\bCurrent Session Open\b/g, 'session open')
    .replace(/\bsession high\b/gi, 'session high')
    .replace(/\bsession low\b/gi, 'session low');
}

function humanizeVenueAndSourceLabel(text: string): string {
  return humanizeMarketLabel(text)
    .replace(/\bbybit\b/gi, 'Bybit')
    .replace(/\bbinance\b/gi, 'Binance')
    .replace(/\bokx\b/gi, 'OKX')
    .replace(/\bsosovalue\b/gi, 'SoSoValue');
}

function formatScenarioForTelegram(text: string): string {
  return humanizeMarketLabel(text)
    .replace(/\s+->\s+/g, ' → ')
    .replace(/(\d[\d,.]*)-(\d[\d,.]*)/g, '$1–$2');
}

function humanizeNumbers(text: string): string {
  return text.replace(/\b\d{5,}(?:\.\d+)?\b/g, (raw) => {
    const value = Number(raw);
    if (!Number.isFinite(value)) return raw;
    return Number(value.toFixed(2)).toLocaleString('en-US', { maximumFractionDigits: 2 });
  });
}

function toUtcCompact(utcIso: string): string {
  const date = new Date(utcIso);
  if (Number.isNaN(date.getTime())) return utcIso;
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute} UTC`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function stripHtmlTags(text: string): string {
  return text.replace(/<\/?(?:b|i|u|s|code|pre|blockquote|a)(?:\s+[^>]*)?>/g, '');
}

function b(text: string): string {
  return `<b>${escapeHtml(text)}</b>`;
}

function code(text: string): string {
  return `<code>${escapeHtml(text)}</code>`;
}

function pushIfNonEmpty(lines: string[], line: string): void {
  const trimmed = line.trim();
  if (trimmed !== '') lines.push(trimmed);
}

function normalizeForDedup(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').replace(/[.:;,\s]+$/g, '').trim();
}

function capReportLength(report: string, maxLength = TELEGRAM_MESSAGE_LIMIT): string {
  if (report.length <= maxLength) return report;

  const footerMarker = '\n─────────────────────\n';
  const markerIndex = report.lastIndexOf(footerMarker);
  const footer = markerIndex >= 0 ? report.slice(markerIndex) : '';
  const body = markerIndex >= 0 ? report.slice(0, markerIndex) : report;
  const availableBodyLength = maxLength - footer.length - 4;

  if (availableBodyLength <= 0) return report.slice(0, maxLength);

  return `${body.slice(0, availableBodyLength).trimEnd()}\n...${footer}`;
}

function capHtmlReportLength(report: string, maxLength: number): string {
  if (report.length <= maxLength) return report;

  const lines = report.split('\n');
  const footer = lines.at(-1) ?? '';
  const bodyLines = lines.slice(0, -1);
  const capped: string[] = [];
  const truncatedLine = '⚠️ Brief shortened to fit Telegram.';

  for (const line of bodyLines) {
    const candidate = [...capped, line, truncatedLine, '', footer].join('\n');
    if (candidate.length > maxLength) break;
    capped.push(line);
  }

  if (capped.length === 0 && bodyLines.length > 0) {
    const reserved = `\n${truncatedLine}\n\n${footer}`.length;
    const available = Math.max(0, maxLength - reserved);
    const firstLine = stripHtmlTags(bodyLines[0] ?? '').slice(0, available).trimEnd();
    return [escapeHtml(firstLine), truncatedLine, '', footer].filter((line) => line !== '').join('\n').trim();
  }

  return [...capped, truncatedLine, '', footer].join('\n').trim();
}

function formatLevels(levels: string[], maxChars: number): string | undefined {
  if (levels.length === 0) return undefined;
  return compact(levels.join(' · '), maxChars);
}

function formatHtmlLevels(levels: string[], maxItems: number): string[] {
  return levels.slice(0, maxItems).map((level) => code(compactComplete(humanizeNumbers(level), 70)));
}

function compactLiquidityLines(output: OverviewOutput): string[] {
  const candidates = [
    output.liquidity.immediateUpside !== undefined ? `Upside: ${output.liquidity.immediateUpside}` : undefined,
    output.liquidity.recoveryZone !== undefined ? `Recovery: ${output.liquidity.recoveryZone}` : undefined,
    output.liquidity.largerUpsideMagnet !== undefined ? `Magnet: ${output.liquidity.largerUpsideMagnet}` : undefined,
    output.liquidity.downsideVulnerability !== undefined ? `Downside: ${output.liquidity.downsideVulnerability}` : undefined,
  ].filter((line): line is string => line !== undefined);

  const existing = new Set<string>();
  for (const line of candidates) {
    const [label, ...valueParts] = line.split(':');
    existing.add(normalizeForDedup(line));
    if (valueParts.length > 0) existing.add(normalizeForDedup(valueParts.join(':')));
    else existing.add(normalizeForDedup(label ?? line));
  }
  for (const bullet of output.liquidity.bullets) {
    if (candidates.length >= 3) break;
    if (existing.has(normalizeForDedup(bullet))) continue;
    candidates.push(bullet);
  }

  return candidates.slice(0, 3).map((line) => compact(line, COMPACT_DETAIL_CHARS));
}

function compactHtmlLiquidityLines(output: OverviewOutput): { label: string; value: string }[] {
  const candidates = [
    output.liquidity.recoveryZone !== undefined ? { label: 'Session recovery', value: output.liquidity.recoveryZone } : undefined,
    output.liquidity.immediateUpside !== undefined ? { label: 'Resistance', value: output.liquidity.immediateUpside } : undefined,
    output.liquidity.largerUpsideMagnet !== undefined ? { label: 'Options ref', value: output.liquidity.largerUpsideMagnet } : undefined,
    output.liquidity.downsideVulnerability !== undefined ? { label: 'Vulnerability', value: output.liquidity.downsideVulnerability } : undefined,
  ].filter((line): line is { label: string; value: string } => line !== undefined);

  if (candidates.length >= 4) return candidates.slice(0, 4);

  const existing = new Set<string>();
  for (const line of candidates) {
    existing.add(normalizeForDedup(`${line.label}:${line.value}`));
    existing.add(normalizeForDedup(line.value));
  }
  for (const bullet of output.liquidity.bullets) {
    if (candidates.length >= 4) break;
    const normalized = normalizeForDedup(bullet);
    if (existing.has(normalized)) continue;
    candidates.push({ label: 'Note', value: bullet });
  }

  return candidates.slice(0, 4);
}

function confidenceMarker(confidence: OverviewOutput['briefConfidence']): string {
  if (confidence === 'high') return '🟢';
  if (confidence === 'medium') return '🟡';
  return '⚪';
}

function formatRegimeForTelegram(output: OverviewOutput): string {
  if (output.marketRegime === 'short_heavy_near_support' && !output.derivatives.positioning.toLowerCase().includes('short')) {
    return 'Defensive breakdown near support';
  }
  return output.marketRegime.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatEthUsd24hLabel(output: OverviewOutput): string {
  const ethMeta = output.eth as OverviewOutput['eth'] & { ethUsd24hLabel?: string };
  const label = ethMeta.ethUsd24hLabel;
  return label === 'strong' || label === 'weak' || label === 'neutral' ? label : 'not shown';
}

function ethLevelLabel(level: string, index: number): string {
  if (index === 0 && /\b(previous week|weekly|previous month|monthly|HTF)\b/i.test(level)) return 'Major recovery/ref';
  return 'Resistance/ref';
}

function formatSpotPrice(value: number | undefined): string | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Number(value.toFixed(2)).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function isInitialRead(output: OverviewOutput): boolean {
  return output.whatChanged.some((bullet) => bullet.toLowerCase().includes('initial reading')
    || bullet.toLowerCase().includes('no previous brief'));
}

export class OverviewFormatter {
  format(output: OverviewOutput): string {
    const { session } = output;
    const display = getSessionDisplay(session);

    const lines: string[] = [];

    // Header
    lines.push(display.title);
    lines.push(`Generated: ${toUtcDatetime(output.generatedAtUtc)} UTC / ${toLocalHHmm(output.generatedAtUtc, display.localTimeZone)} ${display.localTimeLabel}`);
    lines.push('');

    // Regime + confidence
    const regimeDisplay = output.marketRegime.replace(/_/g, ' ');
    lines.push(`Market regime: ${regimeDisplay}`);
    lines.push(`Brief confidence: ${output.briefConfidence}`);
    lines.push('');

    // What changed
    lines.push('📌 What changed');
    for (const bullet of output.whatChanged.slice(0, MAX_WHAT_CHANGED)) {
      lines.push(`• ${compact(bullet, MAX_DETAIL_CHARS)}`);
    }
    lines.push('');

    // BTC
    lines.push('₿ BTC');
    pushIfNonEmpty(lines, compact(output.btc.summary, MAX_SUMMARY_CHARS));
    if (output.btc.keyLevels.length > 0) {
      lines.push(`Key levels: ${compact(output.btc.keyLevels.join(' · '), MAX_LEVELS_CHARS)}`);
    }
    lines.push(`Position: ${compact(output.btc.position, MAX_DETAIL_CHARS)}  |  Structure: ${output.btc.headerLabel ?? output.btc.structure}`);
    lines.push('');

    // ETH
    lines.push('Ξ ETH');
    pushIfNonEmpty(lines, compact(output.eth.summary, MAX_SUMMARY_CHARS));
    lines.push(`vs BTC: ${compact(output.eth.vsbtc, MAX_DETAIL_CHARS)}`);
    if (output.eth.keyLevels.length > 0) {
      lines.push(`Key levels: ${compact(output.eth.keyLevels.join(' · '), MAX_LEVELS_CHARS)}`);
    }
    lines.push('');

    // Alts
    lines.push('🌊 Alts');
    pushIfNonEmpty(lines, compact(output.alts.summary, MAX_SUMMARY_CHARS));
    lines.push(
      `Rotation: ${formatAltRotation(output)}  |  Breadth: ${compact(output.alts.breadth, MAX_DETAIL_CHARS)}`,
    );
    lines.push('');

    // Derivatives
    lines.push('📊 Derivatives');
    lines.push(
      `Funding: ${compact(output.derivatives.funding, 90)}  |  OI: ${compact(output.derivatives.oi, 90)}  |  Positioning: ${compact(output.derivatives.positioning, 90)}`,
    );
    if (output.derivatives.summary.trim() !== '') {
      lines.push(compact(output.derivatives.summary, MAX_SUMMARY_CHARS));
    }
    lines.push('');

    // Liquidity
    lines.push('Liquidity:');
    const structuredLiquidity = [
      output.liquidity.immediateUpside !== undefined
        ? `Immediate upside resistance / liquidity: ${output.liquidity.immediateUpside}`
        : undefined,
      output.liquidity.recoveryZone !== undefined
        ? `Recovery confirmation zone: ${output.liquidity.recoveryZone}`
        : undefined,
      output.liquidity.largerUpsideMagnet !== undefined
        ? `Larger upside magnet / options area: ${output.liquidity.largerUpsideMagnet}`
        : undefined,
      output.liquidity.downsideVulnerability !== undefined
        ? `Downside vulnerability: ${output.liquidity.downsideVulnerability}`
        : undefined,
    ].filter((line): line is string => line !== undefined);
    let liquidityLineCount = 0;
    for (const b of structuredLiquidity) {
      if (liquidityLineCount >= MAX_LIQUIDITY_LINES) break;
      lines.push(`* ${compact(b, MAX_DETAIL_CHARS)}`);
      liquidityLineCount++;
    }
    const structuredText = new Set(structuredLiquidity.map((line) => line.toLowerCase()));
    for (const b of output.liquidity.bullets) {
      if (liquidityLineCount >= MAX_LIQUIDITY_LINES) break;
      if (structuredText.has(b.toLowerCase())) continue;
      lines.push(`* ${compact(b, MAX_DETAIL_CHARS)}`);
      liquidityLineCount++;
    }
    lines.push('');

    // Events (omit section if no upcoming and no summary)
    if (output.events.upcoming.length > 0 || output.events.summary.trim() !== '') {
      lines.push('📅 Events');
      if (output.events.summary.trim() !== '') {
        lines.push(compact(output.events.summary, MAX_SUMMARY_CHARS));
      }
      for (const ev of output.events.upcoming.slice(0, MAX_EVENTS)) {
        const sym = IMPORTANCE_SYMBOL[ev.importance] ?? '⚪';
        lines.push(`${sym} ${compact(ev.title, 120)}  |  ${compact(ev.time, 60)}`);
      }
      lines.push('');
    }

    // Scenarios (always present)
    lines.push('⚡ Scenarios');
    lines.push(`▶ Reclaim: ${compact(output.scenarios.reclaim, MAX_DETAIL_CHARS)}`);
    lines.push(`▶ Rejection: ${compact(output.scenarios.rejection, MAX_DETAIL_CHARS)}`);
    lines.push(`▶ Chop: ${compact(output.scenarios.chop, MAX_DETAIL_CHARS)}`);
    lines.push('');

    // Footer
    lines.push('─────────────────────');
    lines.push(output.note);

    return capReportLength(lines.join('\n'));
  }

  formatCompact(output: OverviewOutput): string {
    const display = getSessionDisplay(output.session);
    const regimeDisplay = output.marketRegime.replace(/_/g, ' ');
    const rotationDisplay = formatAltRotation(output);
    const btcLevels = formatLevels(output.btc.keyLevels, 90);
    const ethLevels = formatLevels(output.eth.keyLevels, 70);
    const highImpactEvents = output.events.upcoming.filter((ev) =>
      ev.importance === 'critical' || ev.importance === 'high'
    );

    const lines: string[] = [
      `${display.title} · ${toUtcDatetime(output.generatedAtUtc)} UTC / ${toLocalHHmm(output.generatedAtUtc, display.localTimeZone)} ${display.localTimeLabel}`,
      `Regime: ${regimeDisplay} · Confidence: ${output.briefConfidence}`,
      '',
      '📌 Changed',
    ];

    for (const bullet of output.whatChanged.slice(0, 3)) {
      lines.push(`• ${compact(bullet, COMPACT_DETAIL_CHARS)}`);
    }

    lines.push('');
    lines.push(`₿ BTC: ${output.btc.headerLabel ?? output.btc.structure} · ${compact(output.btc.position, COMPACT_DETAIL_CHARS)}`);
    pushIfNonEmpty(lines, compact(output.btc.summary, COMPACT_SUMMARY_CHARS));
    if (btcLevels !== undefined) lines.push(`Levels: ${btcLevels}`);

    lines.push('');
    lines.push(`Ξ ETH: ${compact(output.eth.vsbtc, COMPACT_DETAIL_CHARS)}`);
    if (ethLevels !== undefined) lines.push(`Levels: ${ethLevels}`);

    lines.push('');
    lines.push(`🌊 Alts: ${rotationDisplay} · ${compact(output.alts.breadth, COMPACT_DETAIL_CHARS)}`);

    lines.push('');
    lines.push(
      `📊 Derivs: funding ${compact(output.derivatives.funding, 70)} · OI ${compact(output.derivatives.oi, 70)} · ${compact(output.derivatives.positioning, 70)}`,
    );

    const liquidityLines = compactLiquidityLines(output);
    if (liquidityLines.length > 0) {
      lines.push('');
      lines.push('Liquidity:');
      for (const line of liquidityLines) lines.push(`* ${line}`);
    }

    lines.push('');
    if (highImpactEvents.length > 0) {
      lines.push('📅 Events:');
      for (const ev of highImpactEvents.slice(0, 3)) {
        const sym = IMPORTANCE_SYMBOL[ev.importance] ?? '⚪';
        lines.push(`${sym} ${compact(ev.title, 90)} · ${compact(ev.time, 45)}`);
      }
    } else if (output.events.upcoming.length > 0 || output.events.summary.trim() !== '') {
      lines.push('📅 Events: none high-impact');
    }

    lines.push('');
    lines.push('⚡ Scenarios:');
    lines.push(`Reclaim: ${compact(output.scenarios.reclaim, COMPACT_DETAIL_CHARS)}`);
    lines.push(`Reject: ${compact(output.scenarios.rejection, COMPACT_DETAIL_CHARS)}`);
    lines.push(`Chop: ${compact(output.scenarios.chop, COMPACT_DETAIL_CHARS)}`);
    lines.push('');
    lines.push(COMPACT_FOOTER_NOTE);

    return capReportLength(lines.join('\n'), COMPACT_MESSAGE_LIMIT);
  }

  formatTelegramHtmlCompact(output: OverviewOutput): string {
    const display = getSessionDisplay(output.session);
    const regimeDisplay = formatRegimeForTelegram(output);
    const regimeMarker = marketMarker(output.marketRegime);
    const btcHeader = output.btc.headerLabel ?? output.btc.structure;
    const btcMarker = marketMarker(output.btc.structure);
    const ethMeta = output.eth as OverviewOutput['eth'] & { headerLabel?: string; ethUsd24hLabel?: string };
    const ethHeader = ethMeta.headerLabel ?? 'ETH context';
    const ethMarker = marketMarker(`${output.eth.vsbtc} ${ethHeader}`);
    const labels = buildPresentationLabels(output);
    const altsMarker = labels.alts.marker;
    const derivativesMeta = output.derivatives as OverviewOutput['derivatives'] & { sourceScope?: string; verificationStatus?: string };
    const derivativesMarker = labels.derivatives.marker;
    const altsHeader = labels.alts.header;
    const derivativesHeader = labels.derivatives.header;
    const btcSpot = formatSpotPrice(output.btc.spotPrice);
    const ethSpot = formatSpotPrice(output.eth.spotPrice);
    const btcLevels = formatHtmlLevels(output.btc.keyLevels, 2);
    const ethLevels = formatHtmlLevels(output.eth.keyLevels, 2);
    const highImpactEvents = output.events.upcoming.filter((ev) =>
      ev.importance === 'critical' || ev.importance === 'high'
    );
    const eventLines = highImpactEvents.length > 0
      ? highImpactEvents.slice(0, 3).map((ev) =>
          `${eventMarker(ev.importance)} ${escapeHtml(compactComplete(formatEventTitleForTelegram(ev.title), 80))} · ${escapeHtml(eventTimePrefix((ev as { displayTimeType?: string }).displayTimeType))}${eventTimePrefix((ev as { displayTimeType?: string }).displayTimeType) === '' ? '' : ' '}${code(toUtcCompact(ev.time))}`
        )
      : output.events.upcoming.length > 0 || output.events.summary.trim() !== ''
        ? ['🔵 No high-impact BTC/ETH event confirmed']
        : ['⚪ No event source update'];

    const changed = output.whatChanged.slice(0, 2).map((bullet) =>
      `${isInitialRead(output) ? '⚪' : '✅'} ${escapeHtml(compactChangedBullet(bullet, 95))}`
    );
    const btcBullets = [
      ...(btcSpot !== undefined ? [`• Spot: ${code(btcSpot)}`] : []),
      `• ${escapeHtml(compactComplete(output.btc.position, 80))}`,
      `• ${escapeHtml(humanizeMarketLabel(output.btc.summary))}`,
      ...btcLevels.map((level, index) => `• ${btcLevelLabel(level, index)}: ${level}`),
    ].filter((line) => line.trim() !== '•').slice(0, 5);
    const ethBullets = [
      ...(ethSpot !== undefined ? [`• Spot: ${code(ethSpot)}`] : []),
      `• ${escapeHtml(compactComplete(output.eth.vsbtc, 90))}`,
      `• ETH/USD 24h: ${escapeHtml(formatEthUsd24hLabel(output))}`,
      ...ethLevels.map((level, index) => `• ${ethLevelLabel(level, index)}: ${level}`),
      `• ${escapeHtml(compactSentence(output.eth.summary, 80))}`,
    ].filter((line) => line.trim() !== '•').slice(0, 4);
    const altsBullets = [
      `Breadth: ${compactComplete(output.alts.breadth, 80)}`,
      `Scope: ${labels.alts.scope}`,
    ];
    const derivativesSuffix = derivativesMeta.sourceScope === 'single_venue'
      ? ' · source-scoped'
      : '';
    const derivativesBullets = [
      `Funding: ${compactComplete(humanizeVenueAndSourceLabel(output.derivatives.funding), 52)}${derivativesSuffix}`,
      `OI trend: ${compactComplete(humanizeVenueAndSourceLabel(formatDerivativesOi(output.derivatives.oi)), 92)}${derivativesSuffix}`,
      derivativesMeta.sourceScope === 'single_venue'
        ? `Positioning: ${compactComplete(humanizeVenueAndSourceLabel(output.derivatives.positioning), 42)}; broader venues not verified`
        : `Positioning: ${compactComplete(humanizeVenueAndSourceLabel(output.derivatives.positioning), 60)}`,
    ];
    const coverageSummary = (output as OverviewOutput & { coverage?: { summary: string } }).coverage?.summary;
    const flowBullets = (output as OverviewOutput & { flows?: { bullets: string[] } }).flows?.bullets ?? [];
    const confidenceReason = labels.confidenceReason;
    const liquidityLines = compactHtmlLiquidityLines(output);

    const lines: string[] = [
      `${b(display.title)} · ${escapeHtml(toUtcDatetime(output.generatedAtUtc))} UTC / ${escapeHtml(toLocalHHmm(output.generatedAtUtc, display.localTimeZone))} ${escapeHtml(display.localTimeLabel)}`,
      '',
      `${b('Regime:')} ${regimeMarker} ${escapeHtml(regimeDisplay)}`,
      `${b('Confidence:')} ${confidenceMarker(output.briefConfidence)} ${escapeHtml(output.briefConfidence)}`,
      ...(confidenceReason !== undefined ? [`${b('Reason:')} ${escapeHtml(compactComplete(confidenceReason, 105))}`] : []),
      ...(coverageSummary !== undefined ? [`${b('Coverage:')} ${escapeHtml(compactComplete(coverageSummary, 130))}`] : []),
      '',
      b('📌 Changed'),
      ...(changed.length > 0 ? changed : ['⚪ Initial session read']),
      '',
      `${b(`₿ BTC · ${btcMarker} ${btcHeader}`)}`,
      ...btcBullets,
      '',
      `${b(`Ξ ETH · ${ethMarker} ${ethHeader}`)}`,
      ...ethBullets,
      '',
      `${b(`🌊 Alts · ${altsMarker} ${altsHeader}`)}`,
      ...altsBullets.map((line) => `• ${escapeHtml(line)}`),
      '',
      `${b(`📊 Derivs · ${derivativesMarker} ${derivativesHeader}`)}`,
      ...derivativesBullets.map((line) => `• ${escapeHtml(line)}`),
    ];

    if (flowBullets.length > 0) {
      lines.push('', b('🏦 Flows'));
      for (const flow of flowBullets.slice(0, 3)) {
        lines.push(`• ${escapeHtml(compactComplete(humanizeVenueAndSourceLabel(flow), 85))}`);
      }
    }

    if (liquidityLines.length > 0) {
      lines.push('', b('💧 Levels'));
      for (const line of liquidityLines) {
        lines.push(`• ${escapeHtml(line.label)}: ${code(compactComplete(humanizeMarketLabel(line.value), 70))}`);
      }
    }

    lines.push(
      '',
      b('📅 Events'),
      ...eventLines,
      ...highImpactEvents.slice(0, 1).flatMap((ev) => {
        const detail = (ev as { detail?: string }).detail;
        return detail !== undefined ? [`• ${escapeHtml(compactComplete(formatEventDetailForTitle(detail, ev.title), 85))}`] : [];
      }),
      '',
      b('⚡ Scenarios'),
      `Reclaim: ${escapeHtml(formatScenarioForTelegram(output.scenarios.reclaim))}`,
      `Reject: ${escapeHtml(formatScenarioForTelegram(output.scenarios.rejection))}`,
      `Chop: ${escapeHtml(formatScenarioForTelegram(output.scenarios.chop))}`,
      '',
      escapeHtml(COMPACT_FOOTER_NOTE),
    );

    return capHtmlReportLength(lines.join('\n'), HTML_COMPACT_MESSAGE_LIMIT);
  }

  splitForTelegram(report: string, maxLength = 4096): string[] {
    if (!Number.isInteger(maxLength) || maxLength < 1) {
      throw new Error('maxLength must be a positive integer');
    }
    if (report.length <= maxLength) return [report];

    const chunks: string[] = [];
    const lines = report.split('\n');
    let current = '';

    const pushCurrent = (): void => {
      if (current.length > 0) {
        chunks.push(current);
        current = '';
      }
    };

    const appendLine = (line: string): void => {
      const newSection = current.length === 0 ? line : `${current}\n${line}`;
      if (newSection.length > maxLength) {
        pushCurrent();
        current = line;
      } else {
        current = newSection;
      }
    };

    for (const line of lines) {
      if (line.length <= maxLength) {
        appendLine(line);
        continue;
      }

      pushCurrent();
      const plainLine = escapeHtml(stripHtmlTags(line));
      for (let i = 0; i < plainLine.length; i += maxLength) {
        chunks.push(plainLine.slice(i, i + maxLength));
      }
    }
    pushCurrent();
    return chunks;
  }
}
