import type { SessionOverviewDeps } from './service-types.js';
import type { OverviewRunOptions, OverviewRunResult } from './service-types.js';
import type { NormalizedEvent, CollectorRunRecord, DataQualityInfo, HtfLevelsSnapshot, PreviousBriefContext, CollectorRunContext } from './ports.js';
import { OverviewInputBuilder } from './overview-input-builder.js';
import { OverviewFormatter } from './overview-formatter.js';
import { computeDataStatus, buildSourceHealthSummary } from './source-health-evaluator.js';
import { computeWhatChanged, firstBriefBullets } from './brief-diff-engine.js';
import { checkOutputInvariants, hasHardViolations } from './output-invariants.js';
import { classifyMarketRegime } from './market-regime-classifier.js';
import { analyzeAltsBreadth } from './alts-breadth-analyzer.js';
import { buildDerivativesNarrative } from './derivatives-narrative-builder.js';
import { preprocessEvents } from './events-preprocessor.js';
import { analyzeCrossMarket } from './cross-market-analyzer.js';
import {
  computeWeeklyLevels,
  computeDailyLevels,
  computeFourHourLevels,
  buildSessionContext,
  getPreviousSession,
  getSessionBoundaryForDate,
} from '../../core/src/index.js';

const DEFAULT_TOKEN_BUDGET = 2000;

export class OverviewRunner {
  private readonly inputBuilder = new OverviewInputBuilder();
  private readonly formatter = new OverviewFormatter();

  constructor(private readonly deps: SessionOverviewDeps) {}

  async run(options: OverviewRunOptions): Promise<OverviewRunResult> {
    const startedAt = Date.now();
    const { session, symbols } = options;
    const allSymbols = [...new Set([...symbols.core, ...symbols.major, ...symbols.watch])];
    const { logger, repository } = this.deps;

    logger.info({ session }, 'Starting session overview run');

    try {
      // 0. Load previous successful brief for diff context
      const previousRecord = await repository.getLatestOverview(session);
      const previousOutput = previousRecord?.status === 'SUCCESS' ? previousRecord.outputJson : null;

      // 1. Collect market data
      const marketSnapshots = await this.deps.marketDataCollector.collect(allSymbols);

      // 2. Collect derivatives
      const derivativesContext = await this.deps.derivativesCollector.collect(allSymbols);

      // 3. Collect events from all collectors in parallel (failures are soft)
      const allEvents: NormalizedEvent[] = [];
      const collectorRuns: CollectorRunRecord[] = [];
      const eventResults = await Promise.allSettled(
        this.deps.eventCollectors.map(async (collector) => {
          const t0 = Date.now();
          try {
            const events = await collector.collect(session);
            collectorRuns.push({
              collectorName: collector.sourceName,
              startedAt: new Date(t0),
              finishedAt: new Date(),
              status: 'SUCCESS',
              itemCount: events.length,
              durationMs: Date.now() - t0,
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
            getSessionBoundaryForDate(getPreviousSession(session), new Date()),
          )
        : null;

      // 5c. Analyze alts breadth from market snapshots
      const altsBreadth = analyzeAltsBreadth(marketSnapshots);

      // 5d. Build derivatives narrative from status enums
      const derivativesNarrative = buildDerivativesNarrative(derivativesContext);

      // 5e. Cross-market analysis — ETH/BTC ratio trend, dominance signal, top movers
      const crossMarket = analyzeCrossMarket(marketSnapshots);

      // 6. Build data quality summary and pre-compute source health
      const failedSources = collectorRuns
        .filter((r) => r.status === 'FAILED')
        .map((r) => r.collectorName);
      const collectorQuality = collectorRuns.map((r) => ({
        name: r.collectorName,
        status: r.status === 'SUCCESS' ? 'success' as const
          : r.status === 'SKIPPED' ? 'skipped' as const
          : 'failed' as const,
        itemCount: r.itemCount,
        ...(r.errorMessage !== undefined ? { error: r.errorMessage } : {}),
      }));
      const dataQuality: DataQualityInfo = {
        collectors: collectorQuality,
        missingSources: failedSources,
        failedSources,
      };
      // Price and derivatives succeeded — if either had failed, we wouldn't be here
      const dataStatus = computeDataStatus({
        priceOk: true,
        derivativesOk: true,
        eventCollectors: collectorQuality,
      });

      // 7. Build input
      const previousBrief: PreviousBriefContext | undefined = previousOutput !== null ? {
        generatedAtUtc: previousOutput.generatedAtUtc,
        marketRegime: previousOutput.marketRegime,
        briefConfidence: previousOutput.briefConfidence,
        btcStructure: previousOutput.btc.structure,
        btcPosition: previousOutput.btc.position,
        btcSummary: previousOutput.btc.summary,
        ethVsbtc: previousOutput.eth.vsbtc,
        altRotationState: previousOutput.alts.rotationState,
        altBreadth: previousOutput.alts.breadth,
        derivativesFunding: previousOutput.derivatives.funding,
        derivativesOi: previousOutput.derivatives.oi,
        derivativesPositioning: previousOutput.derivatives.positioning,
        upcomingEventTitles: previousOutput.events.upcoming.map((e) => e.title),
      } : undefined;

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
        previousBrief,
        precomputedRegime,
        altsBreadth,
        derivativesNarrative,
        precomputedEvents,
        crossMarket,
      });

      // 7c. Run context collectors (liquidity, ETF flows, options, macro rates)
      const sessionBoundary = getSessionBoundaryForDate(session, new Date());
      const runCtx: CollectorRunContext = {
        session,
        now: new Date(),
        timezone: 'UTC',
        symbols,
        sessionWindow: {
          start: new Date(sessionBoundary.startMs),
          end: new Date(sessionBoundary.endMs),
        },
        lookaheadHours: 24,
      };

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
            durationMs: Date.now() - t0,
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
          });
        }
      }

      // Build source health summary across all collectors
      const allCollectorQuality = [
        ...collectorQuality,
        ...contextRunRecords.map((r) => ({
          name: r.collectorName,
          status: r.status === 'SUCCESS' ? 'success' as const
            : r.status === 'SKIPPED' ? 'skipped' as const
            : 'failed' as const,
          itemCount: r.itemCount,
          ...(r.errorMessage !== undefined ? { error: r.errorMessage } : {}),
        })),
      ];
      const sourceHealth = buildSourceHealthSummary(allCollectorQuality);
      augmentedInput = { ...augmentedInput, sourceHealth };

      // 8. Save input snapshot
      const inputSnapshotId = await repository.saveInputSnapshot(session, augmentedInput);

      // 9. Save collector runs (event collectors + context collectors) and events
      await Promise.all([
        ...[...collectorRuns, ...contextRunRecords].map((r) => repository.saveCollectorRun(r)),
        repository.saveCollectedEvents(allEvents),
      ]);

      // 10. Generate overview
      const llmResult = await this.deps.llmClient.generateOverview(augmentedInput);
      const output = {
        ...llmResult.output,
        marketRegime: precomputedRegime.marketRegime,
        briefConfidence: precomputedRegime.briefConfidence,
        // Use deterministic computed dataStatus, not LLM interpretation
        dataStatus,
        // Fallback liquidity if LLM did not generate it (transitional guard)
        liquidity: llmResult.output.liquidity ?? {
          bullets: ['No confirmed liquidity cluster data available for this session.'],
        },
        alts: {
          ...llmResult.output.alts,
          rotationState: altsBreadth.rotationState !== 'unknown'
            ? altsBreadth.rotationState
            : llmResult.output.alts.rotationState,
          breadth: altsBreadth.totalTracked > 0
            ? altsBreadth.breadthLabel
            : llmResult.output.alts.breadth,
        },
        derivatives: {
          ...llmResult.output.derivatives,
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
          vsbtc: crossMarket.ethBtcTrendLabel !== 'data unavailable'
            ? crossMarket.ethBtcTrendLabel
            : llmResult.output.eth.vsbtc,
        },
        events: {
          ...llmResult.output.events,
          upcoming: precomputedEvents.upcomingEvents.length > 0
            ? precomputedEvents.upcomingEvents
            : llmResult.output.events.upcoming,
        },
        whatChanged: previousOutput !== null
          ? computeWhatChanged(previousOutput, llmResult.output)
          : firstBriefBullets(),
      };

      // 10b. Hard invariant sweep — hard violations downgrade to PARTIAL and block publish
      const invariantViolations = checkOutputInvariants(output);
      const outputHasHardViolations = hasHardViolations(output);
      if (invariantViolations.length > 0) {
        logger.warn({ session, violations: invariantViolations, hard: outputHasHardViolations }, 'Output invariant violations detected');
      }

      // 11. Format
      const humanReport = this.formatter.format(output);

      // 12. Save overview
      const telegramPostIds: string[] = [];
      const overviewId = await repository.saveOverview({
        session,
        status: outputHasHardViolations ? 'PARTIAL' : 'SUCCESS',
        outputJson: output,
        humanReport,
        inputSnapshotId,
        telegramPostIds,
        model: this.deps.llmClient.modelName,
        sourceHealth,
      });

      // 13. Save LLM usage if available
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

      // 14. Publish if requested
      let telegramPublished = false;
      if (options.publish === true && !outputHasHardViolations && this.deps.publisher !== undefined) {
        try {
          const chunks = this.formatter.splitForTelegram(humanReport);
          for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i]!;
            const ids = await this.deps.publisher.publish(chunk, session);
            telegramPostIds.push(...ids);
            for (const msgId of ids) {
              await repository.saveTelegramPost({
                overviewId,
                messageId: msgId,
                chatId: 'configured-chat',
                session,
                messageIndex: i,
                text: chunk,
              });
            }
          }
          // Update existing overview row with post IDs (no duplicate insert)
          await repository.updateOverviewTelegramPosts(overviewId, telegramPostIds);
          telegramPublished = telegramPostIds.length > 0;
        } catch (err) {
          logger.warn({ err }, 'Publishing failed — overview saved but not published');
        }
      }

      const collectorStatus: Record<string, 'success' | 'partial' | 'failed' | 'skipped'> = {};
      for (const run of [...collectorRuns, ...contextRunRecords]) {
        collectorStatus[run.collectorName] =
          run.status === 'SUCCESS' ? 'success'
          : run.status === 'PARTIAL' ? 'partial'
          : run.status === 'SKIPPED' ? 'skipped'
          : 'failed';
      }

      logger.info({ session, overviewId, durationMs: Date.now() - startedAt }, 'Overview run complete');

      return {
        overviewId,
        session,
        status: outputHasHardViolations ? 'PARTIAL' : 'SUCCESS',
        output,
        humanReport,
        ...(telegramPostIds.length > 0 ? { telegramPostIds } : {}),
        durationMs: Date.now() - startedAt,
        telegramPublished,
        marketRegime: output.marketRegime,
        briefConfidence: output.briefConfidence,
        collectorStatus,
      };
    } catch (err) {
      logger.error({ session, err }, 'Overview run failed');
      const errorMessage = err instanceof Error ? err.message : String(err);
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
            note: `Run failed: ${errorMessage}`,
          },
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
      } catch {
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
