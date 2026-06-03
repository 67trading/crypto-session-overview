import type { SessionOverviewDeps } from './service-types.js';
import type { OverviewRunOptions, OverviewRunResult } from './service-types.js';
import type {
  NormalizedEvent,
  CollectorRunRecord,
  DataQualityInfo,
  HtfLevelsSnapshot,
  PreviousBriefContext,
  CollectorRunContext,
  OverviewMarketSnapshot,
  DerivativesContext,
  OverviewOutput,
  OverviewRecord,
  OverviewInput,
} from './ports.js';
import { OverviewInputBuilder } from './overview-input-builder.js';
import { OverviewFormatter } from './overview-formatter.js';
import { computeDataStatus, buildSourceHealthSummary, type EnrichedCollectorQuality } from './source-health-evaluator.js';
import { computeWhatChanged, firstBriefBullets } from './brief-diff-engine.js';
import { checkOutputInvariants, checkSourceAwareOutputInvariants, hasHardViolations } from './output-invariants.js';
import { classifyMarketRegime } from './market-regime-classifier.js';
import { analyzeAltsBreadth } from './alts-breadth-analyzer.js';
import { buildDerivativesNarrative } from './derivatives-narrative-builder.js';
import { preprocessEvents } from './events-preprocessor.js';
import { analyzeCrossMarket } from './cross-market-analyzer.js';
import { PRODUCT_FOOTER_NOTE, buildPresentationContext } from './presentation-contract.js';
import { computeReportConfidence } from './market-regime-confidence.js';
import { buildDeterministicScenarios } from './scenario-builder.js';
import { metrics } from './metrics.js';
import {
  computeWeeklyLevels,
  computeDailyLevels,
  computeFourHourLevels,
  buildSessionContext,
  getPreviousSessionBoundaryForDate,
  getSessionBoundaryForDate,
} from '../../core/src/index.js';

const DEFAULT_TOKEN_BUDGET = 2000;
const PREVIOUS_BRIEF_TEXT_LIMIT = 160;
const PREVIOUS_BRIEF_MAX_EVENTS = 5;

type LlmErrorKind = 'DAILY_QUOTA_EXHAUSTED' | 'RATE_LIMITED' | 'MAX_TOKENS' | 'INVALID_JSON' | 'SCHEMA_VALIDATION' | 'NO_TEXT' | 'UNKNOWN';
type GenerationMode = 'LLM_JSON' | 'TEMPLATE_FALLBACK';
type OverviewOutputWithGenerationMeta = OverviewOutput & {
  generationMode?: GenerationMode;
  llmErrorKind?: LlmErrorKind;
  outputSource?: 'llm_json' | 'deterministic_fallback';
};

function isOverviewOutput(value: unknown): value is OverviewOutput {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { marketRegime?: unknown }).marketRegime === 'string'
    && typeof (value as { briefConfidence?: unknown }).briefConfidence === 'string';
}

function toCollectorQuality(run: CollectorRunRecord): EnrichedCollectorQuality {
  return {
    name: run.collectorName,
    source: run.source ?? run.collectorName,
    status: run.status === 'SUCCESS' ? 'success'
      : run.status === 'PARTIAL' ? 'partial'
      : run.status === 'SKIPPED' ? 'skipped'
      : 'failed',
    itemCount: run.itemCount,
    ...(run.durationMs !== undefined ? { durationMs: run.durationMs } : {}),
    ...(run.dataFreshnessSeconds !== undefined ? { dataFreshnessSeconds: run.dataFreshnessSeconds } : {}),
    ...(run.payloadHash !== undefined ? { payloadHash: run.payloadHash } : {}),
    ...(run.errorMessage !== undefined ? { error: run.errorMessage } : {}),
    ...(run.reasonCode !== undefined ? { reasonCode: run.reasonCode } : {}),
  };
}

function isUniqueRunKeyConflict(err: unknown): boolean {
  const maybe = err as { code?: unknown; meta?: { target?: unknown } };
  if (maybe.code !== 'P2002') return false;
  const target = maybe.meta?.target;
  return Array.isArray(target) ? target.includes('runKey') : target === 'runKey';
}

function isRetryableTerminalStatus(status: OverviewRecord['status']): boolean {
  return status === 'FAILED' || status === 'PARTIAL' || status === 'PUBLISHED_DEGRADED';
}

function isUsablePreviousBriefStatus(status: OverviewRecord['status']): boolean {
  return status === 'SUCCESS' || status === 'PUBLISHED_DEGRADED';
}

function isPublishableStatus(status: OverviewRecord['status']): boolean {
  return status === 'SUCCESS' || status === 'PUBLISHED_DEGRADED' || status === 'PARTIAL';
}

function existingOverviewResult(
  overview: OverviewRecord,
  session: OverviewRunOptions['session'],
  startedAt: number,
): OverviewRunResult | null {
  if (overview.id === undefined) return null;
  const output = isOverviewOutput(overview.outputJson) ? overview.outputJson : undefined;
  return {
    overviewId: overview.id,
    session,
    status: overview.status,
    ...(output !== undefined ? { output } : {}),
    ...(overview.humanReport !== undefined ? { humanReport: overview.humanReport } : {}),
    ...(overview.telegramPostIds !== undefined ? { telegramPostIds: overview.telegramPostIds } : {}),
    durationMs: Date.now() - startedAt,
    telegramPublished: (overview.telegramPostIds?.length ?? 0) > 0,
    ...(output !== undefined ? { marketRegime: output.marketRegime } : {}),
    ...(output !== undefined ? { briefConfidence: output.briefConfidence } : {}),
    collectorStatus: {},
  };
}

function compactPreviousBriefText(text: string, maxChars = PREVIOUS_BRIEF_TEXT_LIMIT): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function buildPreviousBriefContext(previousOutput: OverviewOutput): PreviousBriefContext {
  return {
    generatedAtUtc: previousOutput.generatedAtUtc,
    marketRegime: previousOutput.marketRegime,
    briefConfidence: previousOutput.briefConfidence,
    btcStructure: previousOutput.btc.structure,
    btcPosition: compactPreviousBriefText(previousOutput.btc.position),
    btcSummary: compactPreviousBriefText(previousOutput.btc.summary),
    ethVsbtc: compactPreviousBriefText(previousOutput.eth.vsbtc),
    altRotationState: previousOutput.alts.rotationState,
    altBreadth: compactPreviousBriefText(previousOutput.alts.breadth),
    derivativesFunding: compactPreviousBriefText(previousOutput.derivatives.funding),
    derivativesOi: compactPreviousBriefText(previousOutput.derivatives.oi),
    derivativesPositioning: compactPreviousBriefText(previousOutput.derivatives.positioning),
    upcomingEventTitles: previousOutput.events.upcoming
      .slice(0, PREVIOUS_BRIEF_MAX_EVENTS)
      .map((e: { title: string }) => compactPreviousBriefText(e.title, 120)),
  };
}

function classifyLlmError(error: unknown): LlmErrorKind {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (message.includes('429') && message.includes('RESOURCE_EXHAUSTED') && lower.includes('daily')) {
    return 'DAILY_QUOTA_EXHAUSTED';
  }
  if (message.includes('429') || message.includes('RESOURCE_EXHAUSTED')) return 'RATE_LIMITED';
  if (lower.includes('max_tokens')) return 'MAX_TOKENS';
  if (lower.includes('failed to parse llm response as json')) return 'INVALID_JSON';
  if (lower.includes('schema validation')) return 'SCHEMA_VALIDATION';
  if (lower.includes('no text content')) return 'NO_TEXT';
  return 'UNKNOWN';
}

function formatLevel(value: number | undefined, label: string): string | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return `${Number(value.toFixed(2))} (${label})`;
}

function fallbackKeyLevels(levels: OverviewInput['levels'][string] | undefined): string[] {
  if (levels === undefined) return [];
  return [
    formatLevel(levels.daily?.currentDayOpen, 'current day open'),
    formatLevel(levels.daily?.dailyMidpoint, 'daily midpoint'),
    formatLevel(levels.weekly?.weeklyMidpoint, 'weekly midpoint'),
    formatLevel(levels.fourHour?.resistanceZone.high, '4H resistance high'),
    formatLevel(levels.fourHour?.supportZone.low, '4H support low'),
  ].filter((level): level is string => level !== undefined).slice(0, 4);
}

function fallbackPosition(levels: OverviewInput['levels'][string] | undefined): string {
  const parts = [
    levels?.daily?.dailyPosition?.replace(/_/g, ' '),
    levels?.weekly?.weeklyPosition?.replace(/_/g, ' '),
  ].filter((part): part is string => part !== undefined);
  return parts.length > 0 ? parts.join(', ') : 'deterministic position unavailable';
}

function fallbackStructure(levels: OverviewInput['levels'][string] | undefined): OverviewOutput['btc']['structure'] {
  return levels?.fourHour?.structure ?? 'unknown';
}

function buildOptionsReference(options: OverviewInput['optionsContext'] | undefined): string | undefined {
  const btcOptions = options?.find((option) => option.symbol === 'BTC' || option.currency === 'BTC');
  if (btcOptions === undefined) return undefined;
  const selected = btcOptions.selectedMaxPain;
  if (selected !== undefined) {
    return `${selected.maxPain} max pain · Deribit · ${btcOptions.expiryScope ?? 'front_expiry'} ${selected.expiryDate}`;
  }
  if (btcOptions.maxPainStrike !== undefined) {
    return `${btcOptions.maxPainStrike} max pain · Deribit · expiry scope unclear`;
  }
  return undefined;
}

function buildDeterministicFallbackOverview(params: {
  session: OverviewRunOptions['session'];
  input: OverviewInput;
  precomputedRegime: { marketRegime: OverviewOutput['marketRegime']; briefConfidence: OverviewOutput['briefConfidence'] };
  dataStatus: OverviewOutput['dataStatus'];
  altsBreadth: { rotationState: OverviewOutput['alts']['rotationState']; breadthLabel: string; totalTracked: number };
  derivativesNarrative: Pick<OverviewOutput['derivatives'], 'funding' | 'oi' | 'positioning'>;
  crossMarket: { ethBtcTrendLabel: string };
  previousOutput: OverviewOutput | null;
  llmErrorKind: LlmErrorKind;
}): OverviewOutputWithGenerationMeta {
  const btcLevels = params.input.levels['BTCUSDT'];
  const ethLevels = params.input.levels['ETHUSDT'];
  const liquidity = params.input.liquidityContext;
  const upcoming = params.input.precomputedEvents?.upcomingEvents ?? [];
  const llmNote = params.llmErrorKind === 'DAILY_QUOTA_EXHAUSTED'
    ? 'LLM quota exhausted; deterministic fallback brief generated from collected market context.'
    : `LLM unavailable (${params.llmErrorKind}); deterministic fallback brief generated from collected market context.`;

  return {
    briefId: `fallback-${params.session}-${Date.now()}`,
    generatedAtUtc: params.input.request.createdAt,
    session: params.session,
    marketRegime: params.precomputedRegime.marketRegime,
    briefConfidence: params.precomputedRegime.briefConfidence,
    dataStatus: params.dataStatus,
    whatChanged: params.previousOutput !== null ? computeWhatChanged(params.previousOutput, {
      briefId: 'fallback-current',
      generatedAtUtc: params.input.request.createdAt,
      session: params.session,
      marketRegime: params.precomputedRegime.marketRegime,
      briefConfidence: params.precomputedRegime.briefConfidence,
      dataStatus: params.dataStatus,
      whatChanged: [],
      btc: {
        summary: 'Deterministic fallback read generated from collected price structure.',
        keyLevels: fallbackKeyLevels(btcLevels),
        position: fallbackPosition(btcLevels),
        structure: fallbackStructure(btcLevels),
      },
      eth: {
        summary: 'Deterministic ETH read generated from cross-market context.',
        vsbtc: params.crossMarket.ethBtcTrendLabel,
        keyLevels: fallbackKeyLevels(ethLevels),
      },
      majorAssets: [],
      alts: {
        summary: params.altsBreadth.totalTracked > 0 ? `Tracked alt breadth: ${params.altsBreadth.breadthLabel}.` : 'Alt breadth data unavailable.',
        rotationState: params.altsBreadth.rotationState,
        breadth: params.altsBreadth.totalTracked > 0 ? params.altsBreadth.breadthLabel : 'data unavailable',
      },
      derivatives: {
        summary: 'Deterministic derivatives summary from funding, OI, and positioning collectors.',
        funding: params.derivativesNarrative.funding,
        oi: params.derivativesNarrative.oi,
        positioning: params.derivativesNarrative.positioning,
      },
      liquidity: {
        bullets: liquidity?.clusters !== undefined && liquidity.clusters.length > 0
          ? liquidity.clusters.slice(0, 3).map((cluster) => `${cluster.side} liquidation cluster near ${Number(cluster.price.toFixed(2))}.`)
          : ['No confirmed liquidation cluster data available.'],
      },
      events: {
        summary: upcoming.length > 0 ? 'Deterministic upcoming event list from collected sources.' : 'No high-impact events confirmed from collected sources.',
        upcoming,
      },
      scenarios: {
        reclaim: 'If price reclaims the nearest recovery area, the immediate defensive read weakens.',
        rejection: 'If price rejects at nearby resistance, the session remains defensive.',
        chop: 'If price remains between nearby support and recovery levels, expect compression rather than clean continuation.',
      },
      note: PRODUCT_FOOTER_NOTE,
    }).slice(0, 3) : firstBriefBullets(),
    btc: {
      summary: `${llmNote} BTC read is based on deterministic HTF levels and current structure.`,
      keyLevels: fallbackKeyLevels(btcLevels),
      position: fallbackPosition(btcLevels),
      structure: fallbackStructure(btcLevels),
    },
    eth: {
      summary: 'ETH section is generated from deterministic ETH/BTC and HTF level context.',
      vsbtc: params.crossMarket.ethBtcTrendLabel,
      keyLevels: fallbackKeyLevels(ethLevels),
    },
    majorAssets: [],
    alts: {
      summary: params.altsBreadth.totalTracked > 0 ? `Tracked alt breadth: ${params.altsBreadth.breadthLabel}.` : 'Alt breadth data unavailable.',
      rotationState: params.altsBreadth.rotationState,
      breadth: params.altsBreadth.totalTracked > 0 ? params.altsBreadth.breadthLabel : 'data unavailable',
    },
    derivatives: {
      summary: 'Deterministic derivatives summary from funding, OI, and positioning collectors.',
      funding: params.derivativesNarrative.funding,
      oi: params.derivativesNarrative.oi,
      positioning: params.derivativesNarrative.positioning,
    },
    liquidity: {
      bullets: liquidity?.clusters !== undefined && liquidity.clusters.length > 0
        ? liquidity.clusters.slice(0, 3).map((cluster) => `${cluster.side} liquidation cluster near ${Number(cluster.price.toFixed(2))}.`)
        : ['No confirmed liquidation cluster data available.'],
    },
    events: {
      summary: upcoming.length > 0 ? 'Deterministic upcoming event list from collected sources.' : 'No high-impact events confirmed from collected sources.',
      upcoming,
    },
    scenarios: {
      reclaim: 'If price reclaims the nearest recovery area, the immediate defensive read weakens.',
      rejection: 'If price rejects at nearby resistance, the session remains defensive.',
      chop: 'If price remains between nearby support and recovery levels, expect compression rather than clean continuation.',
    },
    note: PRODUCT_FOOTER_NOTE,
    generationMode: 'TEMPLATE_FALLBACK',
    llmErrorKind: params.llmErrorKind,
    outputSource: 'deterministic_fallback',
  };
}

export class OverviewRunner {
  private readonly inputBuilder = new OverviewInputBuilder();
  private readonly formatter = new OverviewFormatter();

  constructor(private readonly deps: SessionOverviewDeps) {}

  async run(options: OverviewRunOptions): Promise<OverviewRunResult> {
    const startedAt = Date.now();
    const { session, symbols } = options;
    const allSymbols = [...new Set([...symbols.core, ...symbols.major, ...symbols.watch])];
    const { logger, repository } = this.deps;
    const sessionBoundary = getSessionBoundaryForDate(session, new Date());
    const sessionWindowStart = new Date(sessionBoundary.startMs);
    const sessionWindowEnd = new Date(sessionBoundary.endMs);
    const baseRunKey = `${session}:${sessionWindowStart.toISOString()}`;
    let runKey = options.force === true ? `${baseRunKey}:manual:${startedAt}` : baseRunKey;
    let savedInputSnapshotId: string | undefined;

    logger.info({ session }, 'Starting session overview run');

    try {
      // 0. Load previous published/usable brief for diff context. This is advisory:
      // transient DB failures should not abort a run after fresh market data can be collected.
      const recentRecords = await repository.listOverviews({ session, limit: 50 }).catch((err) => {
        logger.warn({ session, err }, 'Failed to list recent overviews for previous brief context');
        return [];
      });
      const latestRecord = recentRecords.length === 0
        ? await repository.getLatestOverview(session).catch((err) => {
            logger.warn({ session, err }, 'Failed to load latest overview for previous brief context');
            return null;
          })
        : null;
      const previousRecord = recentRecords.find((record) => isUsablePreviousBriefStatus(record.status))
        ?? (latestRecord !== null && isUsablePreviousBriefStatus(latestRecord.status) ? latestRecord : null);
      const previousOutput = previousRecord !== null ? previousRecord.outputJson : null;

      if (options.force !== true) {
        const existingOverview = await repository.getOverviewByRunKey(runKey);
        if (existingOverview !== null) {
          if (existingOverview.id === undefined) {
            logger.warn({ session, runKey }, 'Overview runKey exists but has no id; skipping duplicate execution');
            return {
              overviewId: 'unknown',
              session,
              status: existingOverview.status,
              durationMs: Date.now() - startedAt,
              telegramPublished: false,
              collectorStatus: {},
            };
          }

          if (isRetryableTerminalStatus(existingOverview.status)) {
            const retryRunKey = `${baseRunKey}:retry`;
            const existingRetry = await repository.getOverviewByRunKey(retryRunKey);
            if (existingRetry !== null) {
              const existingRetryResult = existingOverviewResult(existingRetry, session, startedAt);
              if (existingRetryResult !== null) {
                logger.info({ session, runKey: retryRunKey, overviewId: existingRetryResult.overviewId }, 'Overview retry already exists for session window');
                return existingRetryResult;
              }
              logger.warn({ session, runKey: retryRunKey }, 'Overview retry runKey exists but has no id; skipping duplicate execution');
              return {
                overviewId: 'unknown',
                session,
                status: existingRetry.status,
                durationMs: Date.now() - startedAt,
                telegramPublished: false,
                collectorStatus: {},
              };
            }
            runKey = retryRunKey;
          } else {
            const existingResult = existingOverviewResult(existingOverview, session, startedAt);
            if (existingResult !== null) {
              logger.info({ session, runKey, overviewId: existingResult.overviewId }, 'Overview run already exists for session window');
              return existingResult;
            }
          }
        }
      }

      const criticalCollectorRuns: CollectorRunRecord[] = [];

      // 1. Collect market data (critical)
      const marketDataStartedAt = Date.now();
      let marketSnapshots: OverviewMarketSnapshot[];
      try {
        marketSnapshots = await this.deps.marketDataCollector.collect(allSymbols);
        criticalCollectorRuns.push({
          collectorName: 'market-data',
          startedAt: new Date(marketDataStartedAt),
          finishedAt: new Date(),
          status: 'SUCCESS',
          itemCount: marketSnapshots.length,
          durationMs: Date.now() - marketDataStartedAt,
          source: 'market-data',
        });
      } catch (err) {
        const durationMs = Date.now() - marketDataStartedAt;
        await repository.saveCollectorRun({
          collectorName: 'market-data',
          startedAt: new Date(marketDataStartedAt),
          finishedAt: new Date(),
          status: 'FAILED',
          itemCount: 0,
          errorMessage: err instanceof Error ? err.message : String(err),
          durationMs,
          source: 'market-data',
        });
        metrics.recordCollectorRun('market-data', 'FAILED', durationMs);
        throw err;
      }

      // 2. Collect derivatives (degraded if unavailable)
      const derivativesStartedAt = Date.now();
      let derivativesContext: Record<string, DerivativesContext>;
      let derivativesFailed = false;
      try {
        derivativesContext = await this.deps.derivativesCollector.collect(allSymbols);
        criticalCollectorRuns.push({
          collectorName: 'derivatives',
          startedAt: new Date(derivativesStartedAt),
          finishedAt: new Date(),
          status: Object.keys(derivativesContext).length >= allSymbols.length ? 'SUCCESS' : 'PARTIAL',
          itemCount: Object.keys(derivativesContext).length,
          durationMs: Date.now() - derivativesStartedAt,
          source: 'derivatives',
        });
      } catch (err) {
        derivativesFailed = true;
        derivativesContext = {};
        criticalCollectorRuns.push({
          collectorName: 'derivatives',
          startedAt: new Date(derivativesStartedAt),
          finishedAt: new Date(),
          status: 'FAILED',
          itemCount: 0,
          errorMessage: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - derivativesStartedAt,
          source: 'derivatives',
        });
      }

      // 3. Collect events from all collectors in parallel (failures are soft)
      const runCtx: CollectorRunContext = {
        session,
        now: new Date(),
        timezone: 'UTC',
        symbols,
        sessionWindow: {
          start: sessionWindowStart,
          end: sessionWindowEnd,
        },
        lookaheadHours: 24,
      };

      const allEvents: NormalizedEvent[] = [];
      const collectorRuns: CollectorRunRecord[] = [];
      const eventResults = await Promise.allSettled(
        this.deps.eventCollectors.map(async (collector) => {
          const t0 = Date.now();
          try {
            const result = await collector.collect(runCtx);
            const events = result.data ?? [];
            collectorRuns.push({
              collectorName: collector.sourceName,
              startedAt: new Date(t0),
              finishedAt: new Date(),
              status: result.status === 'success' ? 'SUCCESS'
                : result.status === 'partial' ? 'PARTIAL'
                : result.status === 'skipped' ? 'SKIPPED'
                : 'FAILED',
              itemCount: result.itemCount,
              durationMs: Date.now() - t0,
              source: result.source ?? collector.sourceName,
              ...(result.payloadHash !== undefined ? { payloadHash: result.payloadHash } : {}),
              ...(result.dataFreshnessSeconds !== undefined ? { dataFreshnessSeconds: result.dataFreshnessSeconds } : {}),
              ...(result.error !== undefined ? { errorMessage: result.error } : {}),
              ...(result.reasonCode !== undefined ? { reasonCode: result.reasonCode } : {}),
            });
            return events;
          } catch (err) {
            logger.warn({ collector: collector.sourceName, err }, 'Event collector failed, using empty array');
            collectorRuns.push({
              collectorName: collector.sourceName,
              startedAt: new Date(t0),
              finishedAt: new Date(),
              status: 'FAILED',
              itemCount: 0,
              errorMessage: err instanceof Error ? err.message : String(err),
              durationMs: Date.now() - t0,
              source: collector.sourceName,
            });
            return [];
          }
        })
      );
      for (const result of eventResults) {
        if (result.status === 'fulfilled') allEvents.push(...result.value);
      }

      // 3b. Preprocess events — dedup by dedupeKey, filter to session, sort by importance+time
      const { filteredEvents, precomputedEvents } = preprocessEvents(allEvents, session);

      // 4. Load active setups (optional)
      const activeSetups = await this.deps.setupLoader?.loadActive(allSymbols) ?? [];

      // 5. Build levels snapshot from market snapshots using computed HTF levels
      const levels: Record<string, HtfLevelsSnapshot> = {};
      for (const snapshot of marketSnapshots) {
        levels[snapshot.symbol] = {
          weekly: snapshot.candles.weekly.length > 0
            ? computeWeeklyLevels(snapshot.latestPrice, snapshot.candles.weekly)
            : null,
          daily: snapshot.candles.daily.length > 0
            ? computeDailyLevels(snapshot.latestPrice, snapshot.candles.daily)
            : null,
          fourHour: snapshot.candles.fourHour.length > 0
            ? computeFourHourLevels(snapshot.latestPrice, snapshot.candles.fourHour)
            : null,
        };
      }

      // 5b. Build session context using BTC as the reference instrument
      const btcSnapshot = marketSnapshots.find((s) => s.symbol === 'BTCUSDT');
      const sessionCtx = btcSnapshot !== undefined
        ? buildSessionContext(
            session,
            btcSnapshot.latestPrice,
            btcSnapshot.candles.fourHour,
            getPreviousSessionBoundaryForDate(session, new Date()),
          )
        : null;

      // 5c. Analyze alts breadth from market snapshots
      const altsBreadth = analyzeAltsBreadth(marketSnapshots);

      // 5d. Build derivatives narrative from status enums
      const derivativesNarrative = buildDerivativesNarrative(derivativesContext);

      // 5e. Cross-market analysis — ETH/BTC ratio trend, dominance signal, top movers
      const crossMarket = analyzeCrossMarket(marketSnapshots);

      // 6. Build data quality summary and pre-compute source health
      const criticalCollectorQuality = criticalCollectorRuns.map(toCollectorQuality);
      const failedSources = [...criticalCollectorRuns, ...collectorRuns]
        .filter((r) => r.status === 'FAILED')
        .map((r) => r.collectorName);
      const collectorQuality: EnrichedCollectorQuality[] = collectorRuns.map(toCollectorQuality);
      const dataQuality: DataQualityInfo = {
        collectors: [...criticalCollectorQuality, ...collectorQuality],
        missingSources: failedSources,
        failedSources,
      };
      const dataStatus = computeDataStatus({
        priceOk: true,
        derivativesOk: !derivativesFailed,
        eventCollectors: collectorQuality,
      });

      // 7. Build input
      const previousBrief = previousOutput !== null ? buildPreviousBriefContext(previousOutput) : undefined;

      // 7b. Pre-compute market regime + confidence from deterministic signals
      const btcLevels = levels['BTCUSDT'];
      const btcDerivatives = derivativesContext['BTCUSDT'];
      const precomputedRegime = classifyMarketRegime({
        btcTone: btcSnapshot !== undefined && btcLevels !== undefined
          ? (() => {
              const price = btcSnapshot.latestPrice;
              if (btcLevels.weekly !== null && price > btcLevels.weekly.previousWeekHigh) return 'bullish_breakout';
              if (btcLevels.weekly !== null && price < btcLevels.weekly.previousWeekLow) return 'bearish_breakdown';
              if (btcLevels.daily !== null && price > btcLevels.daily.dailyMidpoint) return 'constructive';
              if (btcLevels.daily !== null && price < btcLevels.daily.dailyMidpoint) return 'weak';
              return 'neutral';
            })()
          : 'unknown',
        btcFourHourStructure: btcLevels?.fourHour?.structure ?? 'unknown',
        btcWeeklyPosition: btcLevels?.weekly?.weeklyPosition ?? null,
        btcDailyPosition: btcLevels?.daily?.dailyPosition ?? null,
        btcFunding: btcDerivatives?.fundingStatus ?? 'unknown',
        btcOiStatus: btcDerivatives?.oiStatus ?? 'unknown',
        btcPositioning: btcDerivatives?.positioningStatus ?? 'unknown',
        hasCriticalEvents: precomputedEvents.hasCritical,
        dataStatus,
      });

      const input = this.inputBuilder.build({
        session,
        symbols,
        marketSnapshots,
        derivativesContext,
        events: filteredEvents,
        activeSetups,
        sessionContext: sessionCtx,
        levels,
        tokenBudget: options.tokenBudget ?? DEFAULT_TOKEN_BUDGET,
        dataQuality,
        dataStatus,
        ...(previousBrief !== undefined ? { previousBrief } : {}),
        precomputedRegime,
        altsBreadth,
        derivativesNarrative,
        precomputedEvents,
        crossMarket,
      });

      // 7c. Run context collectors (liquidity, ETF flows, options, macro rates)
      let augmentedInput = input;
      const contextRunRecords: CollectorRunRecord[] = [];

      for (const { collector, merge } of this.deps.contextCollectors ?? []) {
        const t0 = Date.now();
        try {
          const result = await collector.collect(runCtx);
          augmentedInput = merge(augmentedInput, result);
          contextRunRecords.push({
            collectorName: collector.sourceName,
            startedAt: new Date(t0),
            finishedAt: new Date(),
            status: result.status === 'success' ? 'SUCCESS'
              : result.status === 'partial' ? 'PARTIAL'
              : result.status === 'skipped' ? 'SKIPPED'
              : 'FAILED',
            itemCount: result.itemCount,
            ...(result.error !== undefined ? { errorMessage: result.error } : {}),
            ...(result.reasonCode !== undefined ? { reasonCode: result.reasonCode } : {}),
            durationMs: Date.now() - t0,
            source: result.source ?? collector.sourceName,
            ...(result.payloadHash !== undefined ? { payloadHash: result.payloadHash } : {}),
            ...(result.dataFreshnessSeconds !== undefined ? { dataFreshnessSeconds: result.dataFreshnessSeconds } : {}),
          });
        } catch (err) {
          logger.warn({ collector: collector.sourceName, err }, 'Context collector failed');
          contextRunRecords.push({
            collectorName: collector.sourceName,
            startedAt: new Date(t0),
            finishedAt: new Date(),
            status: 'FAILED',
            itemCount: 0,
            errorMessage: err instanceof Error ? err.message : String(err),
            durationMs: Date.now() - t0,
            source: collector.sourceName,
          });
        }
      }

      // Build source health summary across all collectors
      const allCollectorQuality: EnrichedCollectorQuality[] = [
        ...criticalCollectorQuality,
        ...collectorQuality,
        ...contextRunRecords.map(toCollectorQuality),
      ];
      const sourceHealth = buildSourceHealthSummary(allCollectorQuality);
      augmentedInput = { ...augmentedInput, sourceHealth };
      const confidenceBreakdown = computeReportConfidence({
        precomputedRegime,
        dataStatus,
        btcLevels,
        derivativesNarrative,
        altsBreadth,
        crossMarket,
        options: augmentedInput.optionsContext,
        events: precomputedEvents,
      });
      const confidenceAdjustedRegime = {
        ...precomputedRegime,
        briefConfidence: confidenceBreakdown.label,
      };
      augmentedInput = {
        ...augmentedInput,
        precomputedRegime: confidenceAdjustedRegime,
        confidenceBreakdown,
      };
      augmentedInput = {
        ...augmentedInput,
        presentationContext: buildPresentationContext(augmentedInput),
      };

      // 8. Persist critical collector telemetry before any later DB write can fail.
      await Promise.all(criticalCollectorRuns.map((r) => repository.saveCollectorRun(r)));

      // 9. Save input snapshot
      const inputSnapshotId = await repository.saveInputSnapshot(session, augmentedInput);
      savedInputSnapshotId = inputSnapshotId;

      // 10. Save event/context collector runs and events
      await Promise.all([
        ...[...collectorRuns, ...contextRunRecords].map((r) => repository.saveCollectorRun(r)),
        repository.saveCollectedEvents(allEvents),
      ]);

      // 11. Generate overview, falling back to deterministic template output when LLM is unavailable.
      let generationMode: GenerationMode = 'LLM_JSON';
      let llmErrorKind: LlmErrorKind | undefined;
      let llmResult: Awaited<ReturnType<typeof this.deps.llmClient.generateOverview>>;
      try {
        llmResult = await this.deps.llmClient.generateOverview(augmentedInput);
      } catch (err) {
        llmErrorKind = classifyLlmError(err);
        generationMode = 'TEMPLATE_FALLBACK';
        logger.warn({ session, err, llmErrorKind }, 'LLM generation failed; using deterministic fallback overview');
        llmResult = {
          output: buildDeterministicFallbackOverview({
            session,
            input: augmentedInput,
            precomputedRegime: confidenceAdjustedRegime,
            dataStatus,
            altsBreadth,
            derivativesNarrative,
            crossMarket,
            previousOutput,
            llmErrorKind,
          }),
        };
      }
      const outputBase = {
        ...llmResult.output,
        marketRegime: confidenceAdjustedRegime.marketRegime,
        briefConfidence: confidenceAdjustedRegime.briefConfidence,
        confidenceBreakdown,
        // Use deterministic computed dataStatus, not LLM interpretation
        dataStatus,
        // Fallback liquidity if LLM did not generate it (transitional guard)
        liquidity: llmResult.output.liquidity ?? {
          bullets: ['No confirmed liquidity cluster data available for this session.'],
        },
        alts: {
          ...llmResult.output.alts,
          sourceScope: altsBreadth.sourceScope,
          basketName: altsBreadth.basketName,
          timeBasis: altsBreadth.timeBasis,
          rotationState: altsBreadth.rotationState !== 'unknown'
            ? altsBreadth.rotationState
            : llmResult.output.alts.rotationState,
          breadth: altsBreadth.totalTracked > 0
            ? altsBreadth.breadthLabel
            : llmResult.output.alts.breadth,
        },
        derivatives: {
          ...llmResult.output.derivatives,
          sourceScope: derivativesNarrative.sourceScope,
          verificationStatus: derivativesNarrative.verificationStatus,
          funding: derivativesNarrative.funding !== 'data unavailable'
            ? derivativesNarrative.funding
            : llmResult.output.derivatives.funding,
          oi: derivativesNarrative.oi !== 'data unavailable'
            ? derivativesNarrative.oi
            : llmResult.output.derivatives.oi,
          positioning: derivativesNarrative.positioning !== 'data unavailable'
            ? derivativesNarrative.positioning
            : llmResult.output.derivatives.positioning,
        },
        eth: {
          ...llmResult.output.eth,
          headerLabel: crossMarket.ethHeaderLabel,
          ethUsd24hLabel: crossMarket.ethUsd24hLabel,
          vsbtc: crossMarket.ethBtcTrendLabel !== 'data unavailable'
            ? crossMarket.ethBtcTrendLabel
            : llmResult.output.eth.vsbtc,
        },
        scenarios: buildDeterministicScenarios(btcLevels, llmResult.output.scenarios),
        events: {
          ...llmResult.output.events,
          upcoming: precomputedEvents.upcomingEvents.length > 0
            ? precomputedEvents.upcomingEvents
            : llmResult.output.events.upcoming,
        },
        note: PRODUCT_FOOTER_NOTE,
        generationMode,
        ...(llmErrorKind !== undefined ? { llmErrorKind } : {}),
        outputSource: generationMode === 'LLM_JSON' ? 'llm_json' : 'deterministic_fallback',
      };
      const optionsReference = buildOptionsReference(augmentedInput.optionsContext);
      if (optionsReference !== undefined) {
        outputBase.liquidity = {
          ...outputBase.liquidity,
          largerUpsideMagnet: optionsReference,
        };
      }
      const output = {
        ...outputBase,
        whatChanged: previousOutput !== null
          ? computeWhatChanged(previousOutput, outputBase)
          : firstBriefBullets(),
      };

      // 11b. Hard invariant sweep — hard violations downgrade to PARTIAL and block publish
      const sourceAwareViolations = checkSourceAwareOutputInvariants(output, augmentedInput);
      const invariantViolations = [
        ...checkOutputInvariants(output),
        ...sourceAwareViolations,
      ];
      const outputHasHardViolations = hasHardViolations(output) || sourceAwareViolations.length > 0;
      if (invariantViolations.length > 0) {
        logger.warn({ session, violations: invariantViolations, hard: outputHasHardViolations }, 'Output invariant violations detected');
      }
      if (outputHasHardViolations) {
        metrics.recordHardInvariantViolation(invariantViolations.length);
      }

      // 12. Format
      const humanReport = this.formatter.formatCompact(output);

      // 13. Save overview
      const telegramPostIds: string[] = [];
      const finalStatus: OverviewRecord['status'] = outputHasHardViolations || derivativesFailed
        ? 'PARTIAL'
        : generationMode === 'TEMPLATE_FALLBACK' ? 'PUBLISHED_DEGRADED' : 'SUCCESS';
      let resultStatus: OverviewRecord['status'] = finalStatus;
      let overviewId: string;
      try {
        overviewId = await repository.saveOverview({
          session,
          status: finalStatus,
          outputJson: output,
          humanReport,
          inputSnapshotId,
          telegramPostIds,
          model: this.deps.llmClient.modelName,
          sourceHealth,
          ...(augmentedInput.crossMarket !== undefined ? { crossMarket: augmentedInput.crossMarket } : {}),
          ...(augmentedInput.etfFlowContext !== undefined ? { etfFlow: augmentedInput.etfFlowContext } : {}),
          ...(augmentedInput.optionsContext !== undefined ? { options: augmentedInput.optionsContext } : {}),
          sessionWindowStart,
          sessionWindowEnd,
          runKey,
        });
      } catch (err) {
        if (isUniqueRunKeyConflict(err)) {
          const existingOverview = await repository.getOverviewByRunKey(runKey);
          const existingResult = existingOverview !== null
            ? existingOverviewResult(existingOverview, session, startedAt)
            : null;
          if (existingResult !== null) {
            logger.warn({ session, runKey, overviewId: existingResult.overviewId }, 'Overview run already saved concurrently');
            return existingResult;
          }
        }
        throw err;
      }

      // 14. Save LLM usage if available
      if (llmResult.usage !== undefined) {
        await repository.saveLlmUsage({
          overviewId,
          model: this.deps.llmClient.modelName,
          inputTokens: llmResult.usage.inputTokens,
          outputTokens: llmResult.usage.outputTokens,
          totalTokens: llmResult.usage.totalTokens,
          durationMs: llmResult.usage.durationMs,
          session,
        });
      }

      // 15. Publish if requested
      let telegramPublished = false;
      const publisher = this.deps.publisher;
      const shouldPublish = options.publish === true
        && publisher !== undefined
        && !outputHasHardViolations
        && isPublishableStatus(finalStatus)
        && (finalStatus !== 'PARTIAL' || generationMode === 'TEMPLATE_FALLBACK');
      if (shouldPublish) {
        const chatId = publisher.chatId ?? 'configured-chat';
        try {
          const telegramReport = this.formatter.formatTelegramHtmlCompact(output);
          const chunks = this.formatter.splitForTelegram(telegramReport);
          for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i]!;
            try {
              const ids = await publisher.publish(chunk, session);
              telegramPostIds.push(...ids);
              for (const msgId of ids) {
                await repository.saveTelegramPost({
                  overviewId,
                  messageId: msgId,
                  chatId,
                  session,
                  messageIndex: i,
                  text: chunk,
                  status: 'SENT',
                });
                metrics.recordTelegramPublish('SENT');
              }
            } catch (err) {
              const errorMessage = err instanceof Error ? err.message : String(err);
              await repository.saveTelegramPost({
                overviewId,
                chatId,
                session,
                messageIndex: i,
                text: chunk,
                status: 'FAILED',
                errorMessage,
              });
              metrics.recordTelegramPublish('FAILED');
              throw err;
            }
          }
          // Update existing overview row with post IDs (no duplicate insert)
          await repository.updateOverviewTelegramPosts(overviewId, telegramPostIds);
          telegramPublished = telegramPostIds.length > 0;
        } catch (err) {
          if (telegramPostIds.length > 0) {
            try {
              await repository.updateOverviewTelegramPosts(overviewId, telegramPostIds);
              telegramPublished = true;
            } catch (updateErr) {
              logger.warn({ err: updateErr }, 'Failed to persist partial Telegram post IDs');
            }
          } else if (finalStatus === 'PUBLISHED_DEGRADED') {
            resultStatus = 'PARTIAL';
            try {
              await repository.updateOverviewStatus(overviewId, resultStatus);
            } catch (updateErr) {
              logger.warn({ err: updateErr }, 'Failed to downgrade overview status after Telegram publish failure');
            }
          }
          logger.warn({ err }, 'Publishing failed — overview saved but not published');
        }
      }

      const collectorStatus: Record<string, 'success' | 'partial' | 'failed' | 'skipped'> = {};
      for (const run of [...criticalCollectorRuns, ...collectorRuns, ...contextRunRecords]) {
        metrics.recordCollectorRun(run.collectorName, run.status, run.durationMs);
        collectorStatus[run.collectorName] =
          run.status === 'SUCCESS' ? 'success'
          : run.status === 'PARTIAL' ? 'partial'
          : run.status === 'SKIPPED' ? 'skipped'
          : 'failed';
      }

      const durationMs = Date.now() - startedAt;
      metrics.recordOverviewRun(session, resultStatus, durationMs);

      logger.info({ session, overviewId, durationMs }, 'Overview run complete');

      return {
        overviewId,
        session,
        status: resultStatus,
        output,
        humanReport,
        ...(telegramPostIds.length > 0 ? { telegramPostIds } : {}),
        durationMs,
        telegramPublished,
        marketRegime: output.marketRegime,
        briefConfidence: output.briefConfidence,
        collectorStatus,
      };
    } catch (err) {
      logger.error({ session, err }, 'Overview run failed');
      const errorMessage = err instanceof Error ? err.message : String(err);
      metrics.recordOverviewRun(session, 'FAILED', Date.now() - startedAt);
      try {
        const overviewId = await repository.saveOverview({
          session,
          status: 'FAILED',
          outputJson: {
            briefId: `failed-${Date.now()}`,
            generatedAtUtc: new Date().toISOString(),
            session,
            marketRegime: 'unknown',
            briefConfidence: 'low',
            dataStatus: { price: 'failed', events: 'failed', derivatives: 'failed', liquidations: 'unavailable' },
            whatChanged: ['Run failed — no data available.'],
            btc: { summary: 'Data unavailable.', keyLevels: [], position: 'unknown', structure: 'unknown' },
            eth: { summary: 'Data unavailable.', vsbtc: 'unknown', keyLevels: [] },
            majorAssets: [],
            alts: { summary: 'Data unavailable.', rotationState: 'unknown', breadth: 'data unavailable' },
            derivatives: { summary: 'Data unavailable.', funding: 'data unavailable', oi: 'data unavailable', positioning: 'data unavailable' },
            events: { summary: 'Data unavailable.', upcoming: [] },
            liquidity: { bullets: ['No confirmed liquidity cluster data available for this session.'] },
            scenarios: { reclaim: 'No data.', rejection: 'No data.', chop: 'No data.' },
            note: PRODUCT_FOOTER_NOTE,
          },
          ...(savedInputSnapshotId !== undefined ? { inputSnapshotId: savedInputSnapshotId } : {}),
          sessionWindowStart,
          sessionWindowEnd,
          runKey,
        });
        return {
          overviewId,
          session,
          status: 'FAILED',
          durationMs: Date.now() - startedAt,
          error: errorMessage,
          telegramPublished: false,
          collectorStatus: {},
        };
      } catch (saveErr) {
        if (isUniqueRunKeyConflict(saveErr)) {
          const existingOverview = await repository.getOverviewByRunKey(runKey).catch(() => null);
          const existingResult = existingOverview !== null
            ? existingOverviewResult(existingOverview, session, startedAt)
            : null;
          if (existingResult !== null) {
            return {
              ...existingResult,
              error: errorMessage,
            };
          }
        }
        return {
          overviewId: 'unknown',
          session,
          status: 'FAILED',
          durationMs: Date.now() - startedAt,
          error: errorMessage,
          telegramPublished: false,
          collectorStatus: {},
        };
      }
    }
  }
}
