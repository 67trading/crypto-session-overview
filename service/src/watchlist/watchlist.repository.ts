import {
  CryptoDailyWatchlistOutputSchema,
  type CryptoDailyWatchlistOutput,
  type CryptoDailyWatchlistStatus,
  type WatchlistInput,
  type WatchlistSession,
} from '../../../core/src/index.js';

export type SaveWatchlistInputArgs = {
  session: WatchlistSession;
  input: WatchlistInput;
};

export type SaveWatchlistArgs = {
  output: CryptoDailyWatchlistOutput;
  inputSnapshotId?: string | null;
  sourceOverviewId?: string | null;
  runKey?: string | null;
};

export type WatchlistListFilters = {
  session?: WatchlistSession;
  status?: CryptoDailyWatchlistStatus;
  limit?: number;
  offset?: number;
};

export interface CryptoDailyWatchlistRepository {
  saveInput(args: SaveWatchlistInputArgs): Promise<string>;
  saveWatchlist(args: SaveWatchlistArgs): Promise<string>;
  getWatchlistById(id: string): Promise<CryptoDailyWatchlistOutput | null>;
  getLatestWatchlist(session: WatchlistSession): Promise<CryptoDailyWatchlistOutput | null>;
  listWatchlists(filters?: WatchlistListFilters): Promise<CryptoDailyWatchlistOutput[]>;
  getHumanReportById(id: string): Promise<string | null>;
  getScoreSummaryById(id: string): Promise<unknown | null>;
  getQcResultById(id: string): Promise<unknown | null>;
}

type WatchlistInputRecord = {
  id: string;
};

type WatchlistRecord = {
  id: string;
  outputJson?: string;
  humanReport?: string | null;
  scoreSummaryJson?: string | null;
  qcResultJson?: string | null;
};

type PrismaWatchlistInputDelegate = {
  create(args: {
    data: {
      session: string;
      inputJson: string;
    };
    select: { id: true };
  }): Promise<WatchlistInputRecord>;
};

type PrismaCryptoDailyWatchlistDelegate = {
  create(args: {
    data: {
      session: string;
      status: string;
      outputJson: string;
      humanReport: string;
      inputSnapshotId: string | null;
      marketRegime: string;
      scoreSummaryJson: string;
      dataQualityJson: string;
      qcResultJson: string;
      sourceOverviewId: string | null;
      runKey: string | null;
      generatedAt: Date;
    };
    select: { id: true };
  }): Promise<WatchlistRecord>;
  findUnique(args:
    | {
        where: { id: string };
        select: { outputJson: true };
      }
    | {
        where: { id: string };
        select: { humanReport: true };
      }
    | {
        where: { id: string };
        select: { scoreSummaryJson: true };
      }
    | {
        where: { id: string };
        select: { qcResultJson: true };
      }): Promise<WatchlistRecord | null>;
  findFirst(args: {
    where: { session: string };
    orderBy: { generatedAt: 'desc' };
    select: { outputJson: true };
  }): Promise<WatchlistRecord | null>;
  findMany(args: {
    where: {
      session?: string;
      status?: string;
    };
    orderBy: { generatedAt: 'desc' };
    take: number;
    skip: number;
    select: { outputJson: true };
  }): Promise<WatchlistRecord[]>;
};

export type PrismaWatchlistClient = {
  watchlistInput: PrismaWatchlistInputDelegate;
  cryptoDailyWatchlist: PrismaCryptoDailyWatchlistDelegate;
};

export class DuplicateWatchlistRunError extends Error {
  constructor(runKey: string) {
    super(`Crypto Daily Watchlist run already exists: ${runKey}`);
    this.name = 'DuplicateWatchlistRunError';
  }
}

export class PrismaCryptoDailyWatchlistRepository implements CryptoDailyWatchlistRepository {
  constructor(private readonly prisma: PrismaWatchlistClient) {}

  async saveInput(args: SaveWatchlistInputArgs): Promise<string> {
    const record = await this.prisma.watchlistInput.create({
      data: {
        session: args.session,
        inputJson: JSON.stringify(args.input),
      },
      select: { id: true },
    });

    return record.id;
  }

  async saveWatchlist(args: SaveWatchlistArgs): Promise<string> {
    const output = CryptoDailyWatchlistOutputSchema.parse(args.output);

    try {
      const record = await this.prisma.cryptoDailyWatchlist.create({
        data: {
          session: output.session,
          status: output.status,
          outputJson: JSON.stringify(output),
          humanReport: output.userFacingReport.summary,
          inputSnapshotId: args.inputSnapshotId ?? null,
          marketRegime: output.marketContext.marketRegime,
          scoreSummaryJson: JSON.stringify(buildScoreSummary(output)),
          dataQualityJson: JSON.stringify(output.dataQuality),
          qcResultJson: JSON.stringify(output.qualityControl),
          sourceOverviewId: args.sourceOverviewId ?? output.marketContext.sourceOverviewId ?? null,
          runKey: args.runKey ?? null,
          generatedAt: new Date(output.generatedAtUtc),
        },
        select: { id: true },
      });

      return record.id;
    } catch (error) {
      if (args.runKey !== undefined && args.runKey !== null && isUniqueConstraintError(error)) {
        throw new DuplicateWatchlistRunError(args.runKey);
      }
      throw error;
    }
  }

  async getWatchlistById(id: string): Promise<CryptoDailyWatchlistOutput | null> {
    const record = await this.prisma.cryptoDailyWatchlist.findUnique({
      where: { id },
      select: { outputJson: true },
    });

    if (record?.outputJson === undefined) return null;
    return parseWatchlistOutput(record.outputJson);
  }

  async getLatestWatchlist(session: WatchlistSession): Promise<CryptoDailyWatchlistOutput | null> {
    const record = await this.prisma.cryptoDailyWatchlist.findFirst({
      where: { session },
      orderBy: { generatedAt: 'desc' },
      select: { outputJson: true },
    });

    if (record?.outputJson === undefined) return null;
    return parseWatchlistOutput(record.outputJson);
  }

  async listWatchlists(filters: WatchlistListFilters = {}): Promise<CryptoDailyWatchlistOutput[]> {
    const where = {
      ...(filters.session !== undefined ? { session: filters.session } : {}),
      ...(filters.status !== undefined ? { status: filters.status } : {}),
    };

    const records = await this.prisma.cryptoDailyWatchlist.findMany({
      where,
      orderBy: { generatedAt: 'desc' },
      take: filters.limit ?? 20,
      skip: filters.offset ?? 0,
      select: { outputJson: true },
    });

    return records.map((record) => parseWatchlistOutput(record.outputJson ?? 'null'));
  }

  async getHumanReportById(id: string): Promise<string | null> {
    const record = await this.prisma.cryptoDailyWatchlist.findUnique({
      where: { id },
      select: { humanReport: true },
    });

    return record?.humanReport ?? null;
  }

  async getScoreSummaryById(id: string): Promise<unknown | null> {
    const record = await this.prisma.cryptoDailyWatchlist.findUnique({
      where: { id },
      select: { scoreSummaryJson: true },
    });

    if (record?.scoreSummaryJson === undefined || record.scoreSummaryJson === null) return null;
    return JSON.parse(record.scoreSummaryJson);
  }

  async getQcResultById(id: string): Promise<unknown | null> {
    const record = await this.prisma.cryptoDailyWatchlist.findUnique({
      where: { id },
      select: { qcResultJson: true },
    });

    if (record?.qcResultJson === undefined || record.qcResultJson === null) return null;
    return JSON.parse(record.qcResultJson);
  }
}

export function parseWatchlistOutput(value: string): CryptoDailyWatchlistOutput {
  const parsedJson: unknown = JSON.parse(value);
  return CryptoDailyWatchlistOutputSchema.parse(parsedJson);
}

export function buildScoreSummary(output: CryptoDailyWatchlistOutput): {
  aListCount: number;
  bListCount: number;
  candidatePoolCount: number;
  removedDowngradedCount: number;
  topScore: number | null;
  averageAListScore: number | null;
} {
  const aListScores = output.watchlist.aList.map((asset) => asset.score);
  const allScores = [
    ...output.watchlist.aList,
    ...output.watchlist.bList,
    ...output.watchlist.candidatePool,
  ].map((asset) => asset.score);

  return {
    aListCount: output.watchlist.aList.length,
    bListCount: output.watchlist.bList.length,
    candidatePoolCount: output.watchlist.candidatePool.length,
    removedDowngradedCount: output.watchlist.removedDowngraded.length,
    topScore: allScores.length > 0 ? Math.max(...allScores) : null,
    averageAListScore: aListScores.length > 0
      ? aListScores.reduce((sum, score) => sum + score, 0) / aListScores.length
      : null,
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  const maybe = error as { code?: unknown; meta?: { target?: unknown } };
  if (maybe.code !== 'P2002') return false;
  const target = maybe.meta?.target;
  return Array.isArray(target) ? target.includes('runKey') : target === 'runKey';
}
