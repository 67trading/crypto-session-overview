import { PrismaClient } from './generated/prisma-client/index.js';
import type {
  SessionOverviewRepository,
  CryptoSession,
  OverviewInput,
  NormalizedEvent,
  CollectorRunRecord,
  OverviewRecord,
  OverviewFilters,
  TelegramPostRecord,
  TelegramPostFilters,
  LlmUsageRecord,
  EventFilters,
  CollectorRunFilters,
} from '../../service/src/ports.js';

export class PrismaSessionOverviewRepository implements SessionOverviewRepository {
  private readonly prisma: PrismaClient;

  constructor(databaseUrl: string) {
    this.prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  }

  async saveInputSnapshot(session: CryptoSession, input: OverviewInput): Promise<string> {
    const record = await this.prisma.overviewInput.create({
      data: {
        session,
        inputJson: JSON.stringify(input),
      },
    });
    return record.id;
  }

  async saveCollectedEvents(events: NormalizedEvent[]): Promise<void> {
    if (events.length === 0) return;
    await this.prisma.collectedEvent.createMany({
      data: events.map((e) => ({
        eventId: e.eventId,
        eventType: e.eventType,
        category: e.category,
        title: e.title,
        source: e.source,
        relevanceScore: e.relevanceScore,
        dedupeKey: e.dedupeKey,
        rawJson: JSON.stringify(e),
        ...(e.asset !== undefined ? { asset: e.asset } : {}),
        ...(e.exchange !== undefined ? { exchange: e.exchange } : {}),
        ...(e.scheduledTime !== undefined ? { scheduledTime: e.scheduledTime } : {}),
        importance: e.importance,
        confidence: e.confidence,
      })),
    });
  }

  async saveCollectorRun(run: CollectorRunRecord): Promise<void> {
    await this.prisma.collectorRun.create({
      data: {
        collectorName: run.collectorName,
        startedAt: run.startedAt,
        ...(run.finishedAt !== undefined ? { finishedAt: run.finishedAt } : {}),
        status: run.status,
        itemCount: run.itemCount,
        ...(run.errorMessage !== undefined ? { errorMessage: run.errorMessage } : {}),
        ...(run.durationMs !== undefined ? { durationMs: run.durationMs } : {}),
        ...(run.dataFreshnessSeconds !== undefined ? { dataFreshnessSeconds: run.dataFreshnessSeconds } : {}),
        ...(run.fallbackUsed !== undefined ? { fallbackUsed: run.fallbackUsed } : {}),
      },
    });
  }

  async saveOverview(record: OverviewRecord): Promise<string> {
    const telegramPostIds = JSON.stringify(record.telegramPostIds ?? []);
    const output = record.outputJson;
    const row = await this.prisma.sessionOverview.create({
      data: {
        session: record.session,
        status: record.status,
        outputJson: JSON.stringify(output),
        ...(record.humanReport !== undefined ? { humanReport: record.humanReport } : {}),
        ...(record.inputSnapshotId !== undefined ? { inputSnapshotId: record.inputSnapshotId } : {}),
        telegramPostIds,
        ...(record.promptVersion !== undefined ? { promptVersion: record.promptVersion } : {}),
        ...(record.model !== undefined ? { model: record.model } : {}),
        ...(record.sourceHealth !== undefined ? { sourceHealthJson: JSON.stringify(record.sourceHealth) } : {}),
        marketRegime: output.marketRegime,
        briefConfidence: output.briefConfidence,
        dataStatusJson: JSON.stringify(output.dataStatus),
        whatChangedJson: JSON.stringify(output.whatChanged),
        scenariosJson: JSON.stringify(output.scenarios),
        liquidityJson: JSON.stringify(output.liquidity ?? null),
        eventsJson: JSON.stringify(output.events ?? null),
      },
    });
    return row.id;
  }

  async updateOverviewTelegramPosts(id: string, postIds: string[]): Promise<void> {
    await this.prisma.sessionOverview.update({
      where: { id },
      data: { telegramPostIds: JSON.stringify(postIds) },
    });
  }

  async getLatestOverview(session: CryptoSession): Promise<OverviewRecord | null> {
    const row = await this.prisma.sessionOverview.findFirst({
      where: { session },
      orderBy: { createdAt: 'desc' },
    });
    if (row === null) return null;
    return this.toOverviewRecord(row);
  }

  async listOverviews(filters: OverviewFilters): Promise<OverviewRecord[]> {
    const rows = await this.prisma.sessionOverview.findMany({
      where: {
        ...(filters.session !== undefined ? { session: filters.session } : {}),
        ...(filters.fromDate !== undefined ? { createdAt: { gte: filters.fromDate } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: filters.limit,
    });
    return rows.map((row) => this.toOverviewRecord(row));
  }

  async saveTelegramPost(post: TelegramPostRecord): Promise<string> {
    const row = await this.prisma.telegramOverviewPost.create({
      data: {
        overviewId: post.overviewId,
        messageId: post.messageId,
        chatId: post.chatId,
        session: post.session,
        ...(post.messageIndex !== undefined ? { messageIndex: post.messageIndex } : {}),
        ...(post.text !== undefined ? { text: post.text } : {}),
      },
    });
    return row.id;
  }

  async saveLlmUsage(usage: LlmUsageRecord): Promise<string> {
    const row = await this.prisma.overviewLlmUsage.create({
      data: {
        overviewId: usage.overviewId,
        model: usage.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        durationMs: usage.durationMs,
        ...(usage.promptVersion !== undefined ? { promptVersion: usage.promptVersion } : {}),
        ...(usage.session !== undefined ? { session: usage.session } : {}),
        ...(usage.costEstimate !== undefined ? { costEstimate: usage.costEstimate } : {}),
      },
    });
    return row.id;
  }

  async getOverviewById(id: string): Promise<OverviewRecord | null> {
    const row = await this.prisma.sessionOverview.findUnique({
      where: { id },
    });
    if (row === null) return null;
    return this.toOverviewRecord(row);
  }

  async listEvents(filters: EventFilters): Promise<NormalizedEvent[]> {
    // Fetch more rows than the limit when session filtering is needed to avoid
    // under-returning due to in-memory filtering applied after the DB take.
    const fetchLimit = filters.session !== undefined && filters.limit !== undefined
      ? filters.limit * 5
      : filters.limit;

    const rows = await this.prisma.collectedEvent.findMany({
      where: {
        ...(filters.eventType !== undefined ? { eventType: filters.eventType } : {}),
        ...(filters.asset !== undefined ? { asset: filters.asset } : {}),
        ...(filters.source !== undefined ? { source: filters.source } : {}),
        ...(filters.category !== undefined ? { category: filters.category } : {}),
        ...(filters.importance !== undefined ? { importance: filters.importance } : {}),
        ...(filters.fromDate !== undefined ? { collectedAt: { gte: filters.fromDate } } : {}),
      },
      orderBy: { collectedAt: 'desc' },
      take: fetchLimit,
    });

    const events = rows.map((row) => JSON.parse(row.rawJson) as NormalizedEvent);

    if (filters.session !== undefined) {
      const session = filters.session;
      const filtered = events.filter((e) => e.sessionRelevance.includes(session));
      return filters.limit !== undefined ? filtered.slice(0, filters.limit) : filtered;
    }

    return events;
  }

  async listTelegramPosts(filters: TelegramPostFilters): Promise<TelegramPostRecord[]> {
    const rows = await this.prisma.telegramOverviewPost.findMany({
      where: {
        ...(filters.overviewId !== undefined ? { overviewId: filters.overviewId } : {}),
        ...(filters.session !== undefined ? { session: filters.session } : {}),
      },
      orderBy: { postedAt: 'desc' },
      take: filters.limit ?? 20,
    });
    return rows.map((row) => ({
      overviewId: row.overviewId,
      messageId: row.messageId,
      chatId: row.chatId,
      session: row.session as CryptoSession,
      ...(row.messageIndex !== null ? { messageIndex: row.messageIndex } : {}),
      ...(row.text !== null ? { text: row.text } : {}),
    }));
  }

  async listCollectorRuns(filters: CollectorRunFilters): Promise<CollectorRunRecord[]> {
    const rows = await this.prisma.collectorRun.findMany({
      where: {
        ...(filters.collectorName !== undefined ? { collectorName: filters.collectorName } : {}),
        ...(filters.status !== undefined ? { status: filters.status } : {}),
        ...(filters.fromDate !== undefined ? { startedAt: { gte: filters.fromDate } } : {}),
      },
      orderBy: { startedAt: 'desc' },
      take: filters.limit,
    });

    return rows.map((row) => ({
      collectorName: row.collectorName,
      startedAt: row.startedAt,
      ...(row.finishedAt !== null ? { finishedAt: row.finishedAt } : {}),
      status: row.status as CollectorRunRecord['status'],
      itemCount: row.itemCount,
      ...(row.errorMessage !== null ? { errorMessage: row.errorMessage } : {}),
      ...(row.durationMs !== null ? { durationMs: row.durationMs } : {}),
      ...(row.dataFreshnessSeconds !== null ? { dataFreshnessSeconds: row.dataFreshnessSeconds } : {}),
      ...(row.fallbackUsed !== null ? { fallbackUsed: row.fallbackUsed } : {}),
    }));
  }

  private toOverviewRecord(row: {
    id: string;
    session: string;
    status: string;
    outputJson: string;
    humanReport: string | null;
    inputSnapshotId: string | null;
    telegramPostIds: string;
    promptVersion: string | null;
    model: string | null;
    createdAt: Date;
  }): OverviewRecord {
    const telegramPostIds = JSON.parse(row.telegramPostIds) as string[];
    return {
      id: row.id,
      session: row.session as CryptoSession,
      status: row.status as OverviewRecord['status'],
      outputJson: JSON.parse(row.outputJson) as OverviewRecord['outputJson'],
      ...(row.humanReport !== null ? { humanReport: row.humanReport } : {}),
      ...(row.inputSnapshotId !== null ? { inputSnapshotId: row.inputSnapshotId } : {}),
      ...(telegramPostIds.length > 0 ? { telegramPostIds } : {}),
      ...(row.promptVersion !== null ? { promptVersion: row.promptVersion } : {}),
      ...(row.model !== null ? { model: row.model } : {}),
      createdAt: row.createdAt,
    };
  }
}
