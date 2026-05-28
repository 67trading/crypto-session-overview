import type { SessionOverviewDeps } from './service-types.js';
import type { OverviewRunOptions, OverviewRunResult } from './service-types.js';
import type { NormalizedEvent, CollectorRunRecord, DataQualityInfo, HtfLevelsSnapshot } from './ports.js';
import { OverviewInputBuilder } from './overview-input-builder.js';
import { OverviewFormatter } from './overview-formatter.js';
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

      // 6. Build data quality summary
      const failedSources = collectorRuns
        .filter((r) => r.status === 'FAILED')
        .map((r) => r.collectorName);
      const dataQuality: DataQualityInfo = {
        collectors: collectorRuns.map((r) => ({
          name: r.collectorName,
          status: r.status === 'SUCCESS' ? 'success' : r.status === 'FAILED' ? 'failed' : 'partial',
          itemCount: r.itemCount,
          ...(r.errorMessage !== undefined ? { error: r.errorMessage } : {}),
        })),
        missingSources: failedSources,
        failedSources,
      };

      // 7. Build input
      const input = this.inputBuilder.build({
        session,
        symbols,
        marketSnapshots,
        derivativesContext,
        events: allEvents,
        activeSetups,
        sessionContext: sessionCtx,
        levels,
        tokenBudget: options.tokenBudget ?? DEFAULT_TOKEN_BUDGET,
        dataQuality,
      });

      // 8. Save input snapshot
      const inputSnapshotId = await repository.saveInputSnapshot(session, input);

      // 9. Save collector runs and events
      await Promise.all([
        ...collectorRuns.map((r) => repository.saveCollectorRun(r)),
        repository.saveCollectedEvents(allEvents),
      ]);

      // 10. Generate overview
      const llmResult = await this.deps.llmClient.generateOverview(input);
      const output = llmResult.output;

      // 11. Format
      const humanReport = this.formatter.format(output);

      // 12. Save overview
      const telegramPostIds: string[] = [];
      const overviewId = await repository.saveOverview({
        session,
        status: 'SUCCESS',
        outputJson: output,
        humanReport,
        inputSnapshotId,
        telegramPostIds,
        model: this.deps.llmClient.modelName,
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
      if (options.publish === true && this.deps.publisher !== undefined) {
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
        } catch (err) {
          logger.warn({ err }, 'Publishing failed — overview saved but not published');
        }
      }

      logger.info({ session, overviewId, durationMs: Date.now() - startedAt }, 'Overview run complete');

      return {
        overviewId,
        session,
        status: 'SUCCESS',
        output,
        humanReport,
        ...(telegramPostIds.length > 0 ? { telegramPostIds } : {}),
        durationMs: Date.now() - startedAt,
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
            scenarios: { reclaim: 'No data.', rejection: 'No data.', chop: 'No data.' },
            note: `Run failed: ${errorMessage}`,
          },
        });
        return { overviewId, session, status: 'FAILED', durationMs: Date.now() - startedAt, error: errorMessage };
      } catch {
        return { overviewId: 'unknown', session, status: 'FAILED', durationMs: Date.now() - startedAt, error: errorMessage };
      }
    }
  }
}
