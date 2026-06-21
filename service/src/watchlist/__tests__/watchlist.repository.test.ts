import { describe, expect, it } from 'vitest';
import type {
  CryptoDailyWatchlistOutput,
  WatchlistInput,
} from '../../../../core/src/index.js';
import {
  DuplicateWatchlistRunError,
  PrismaCryptoDailyWatchlistRepository,
  type PrismaWatchlistClient,
} from '../watchlist.repository.js';

type WatchlistRow = {
  id: string;
  session: string;
  status: string;
  outputJson: string;
  humanReport: string | null;
  inputSnapshotId: string | null;
  marketRegime: string | null;
  scoreSummaryJson: string | null;
  dataQualityJson: string | null;
  qcResultJson: string | null;
  sourceOverviewId: string | null;
  runKey: string | null;
  generatedAt: Date;
};

type InputRow = {
  id: string;
  session: string;
  inputJson: string;
};

class FakeWatchlistPrisma implements PrismaWatchlistClient {
  readonly inputRows: InputRow[] = [];
  readonly watchlistRows: WatchlistRow[] = [];

  readonly watchlistInput = {
    create: async (args: {
      data: {
        session: string;
        inputJson: string;
      };
      select: { id: true };
    }) => {
      const row = {
        id: `input-${this.inputRows.length + 1}`,
        ...args.data,
      };
      this.inputRows.push(row);
      return { id: row.id };
    },
  };

  readonly cryptoDailyWatchlist = {
    create: async (args: {
      data: Omit<WatchlistRow, 'id'>;
      select: { id: true };
    }) => {
      if (
        args.data.runKey !== null
        && this.watchlistRows.some((row) => row.runKey === args.data.runKey)
      ) {
        throw Object.assign(new Error('Unique constraint failed on the fields: (`runKey`)'), {
          code: 'P2002',
          meta: { target: ['runKey'] },
        });
      }

      const row = {
        id: `watchlist-${this.watchlistRows.length + 1}`,
        ...args.data,
      };
      this.watchlistRows.push(row);
      return { id: row.id };
    },

    findUnique: async (args: {
      where: { id: string };
      select: Partial<Record<'outputJson' | 'humanReport' | 'scoreSummaryJson' | 'qcResultJson', true>>;
    }) => {
      const row = this.watchlistRows.find((candidate) => candidate.id === args.where.id);
      if (row === undefined) return null;
      if (args.select.outputJson === true) return { id: row.id, outputJson: row.outputJson };
      if (args.select.humanReport === true) return { id: row.id, humanReport: row.humanReport };
      if (args.select.scoreSummaryJson === true) {
        return { id: row.id, scoreSummaryJson: row.scoreSummaryJson };
      }
      if (args.select.qcResultJson === true) return { id: row.id, qcResultJson: row.qcResultJson };
      return { id: row.id };
    },

    findFirst: async (args: {
      where: { session: string };
      orderBy: { generatedAt: 'desc' };
      select: { outputJson: true };
    }) => {
      void args.orderBy;
      void args.select;
      const row = this.watchlistRows
        .filter((candidate) => candidate.session === args.where.session)
        .sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime())[0];
      return row === undefined ? null : { id: row.id, outputJson: row.outputJson };
    },

    findMany: async (args: {
      where: {
        session?: string;
        status?: string;
      };
      orderBy: { generatedAt: 'desc' };
      take: number;
      skip: number;
      select: { outputJson: true };
    }) => {
      void args.orderBy;
      void args.select;
      return this.watchlistRows
        .filter((row) => args.where.session === undefined || row.session === args.where.session)
        .filter((row) => args.where.status === undefined || row.status === args.where.status)
        .sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime())
        .slice(args.skip, args.skip + args.take)
        .map((row) => ({ id: row.id, outputJson: row.outputJson }));
    },
  };
}

describe('PrismaCryptoDailyWatchlistRepository', () => {
  it('persists input snapshots', async () => {
    const prisma = new FakeWatchlistPrisma();
    const repo = new PrismaCryptoDailyWatchlistRepository(prisma);
    const input = makeInput('EUROPE_CRYPTO');

    const id = await repo.saveInput({ session: 'EUROPE_CRYPTO', input });

    expect(id).toBe('input-1');
    expect(prisma.inputRows).toHaveLength(1);
    expect(prisma.inputRows[0]).toMatchObject({
      session: 'EUROPE_CRYPTO',
      inputJson: JSON.stringify(input),
    });
  });

  it('persists a valid output with denormalized fields', async () => {
    const prisma = new FakeWatchlistPrisma();
    const repo = new PrismaCryptoDailyWatchlistRepository(prisma);
    const output = makeOutput({ session: 'EUROPE_CRYPTO' });

    const id = await repo.saveWatchlist({
      output,
      inputSnapshotId: 'input-1',
      runKey: 'EUROPE_CRYPTO:2026-06-21:daily-watchlist',
    });

    expect(id).toBe('watchlist-1');
    expect(prisma.watchlistRows[0]).toMatchObject({
      session: 'EUROPE_CRYPTO',
      status: 'complete',
      humanReport: 'Daily watchlist summary',
      inputSnapshotId: 'input-1',
      marketRegime: 'risk_on',
      sourceOverviewId: 'overview-1',
      runKey: 'EUROPE_CRYPTO:2026-06-21:daily-watchlist',
      generatedAt: new Date(output.generatedAtUtc),
    });
  });

  it('rejects invalid output on save', async () => {
    const prisma = new FakeWatchlistPrisma();
    const repo = new PrismaCryptoDailyWatchlistRepository(prisma);
    const invalid = {
      ...makeOutput({ session: 'EUROPE_CRYPTO' }),
      product: 'bad-data',
    } as unknown as CryptoDailyWatchlistOutput;

    await expect(repo.saveWatchlist({ output: invalid })).rejects.toThrow();
    expect(prisma.watchlistRows).toHaveLength(0);
  });

  it('returns parsed watchlist output by id', async () => {
    const prisma = new FakeWatchlistPrisma();
    const repo = new PrismaCryptoDailyWatchlistRepository(prisma);
    const output = makeOutput({ session: 'EUROPE_CRYPTO' });
    const id = await repo.saveWatchlist({ output });

    await expect(repo.getWatchlistById(id)).resolves.toEqual(output);
  });

  it('returns latest watchlist for a session by generatedAt', async () => {
    const prisma = new FakeWatchlistPrisma();
    const repo = new PrismaCryptoDailyWatchlistRepository(prisma);
    await repo.saveWatchlist({
      output: makeOutput({
        id: 'older',
        session: 'US_CRYPTO',
        generatedAtUtc: '2026-06-21T08:00:00.000Z',
      }),
    });
    await repo.saveWatchlist({
      output: makeOutput({
        id: 'newer',
        session: 'US_CRYPTO',
        generatedAtUtc: '2026-06-21T12:00:00.000Z',
      }),
    });
    await repo.saveWatchlist({
      output: makeOutput({
        id: 'other-session',
        session: 'ASIA_CRYPTO',
        generatedAtUtc: '2026-06-21T13:00:00.000Z',
      }),
    });

    await expect(repo.getLatestWatchlist('US_CRYPTO')).resolves.toMatchObject({ id: 'newer' });
  });

  it('lists watchlists filtered by session and status', async () => {
    const prisma = new FakeWatchlistPrisma();
    const repo = new PrismaCryptoDailyWatchlistRepository(prisma);
    await repo.saveWatchlist({
      output: makeOutput({ id: 'europe-complete', session: 'EUROPE_CRYPTO', status: 'complete' }),
    });
    await repo.saveWatchlist({
      output: makeOutput({ id: 'europe-degraded', session: 'EUROPE_CRYPTO', status: 'degraded' }),
    });
    await repo.saveWatchlist({
      output: makeOutput({ id: 'us-complete', session: 'US_CRYPTO', status: 'complete' }),
    });

    const result = await repo.listWatchlists({
      session: 'EUROPE_CRYPTO',
      status: 'complete',
    });

    expect(result.map((row) => row.id)).toEqual(['europe-complete']);
  });

  it('returns report text, score summary, and QC result', async () => {
    const prisma = new FakeWatchlistPrisma();
    const repo = new PrismaCryptoDailyWatchlistRepository(prisma);
    const id = await repo.saveWatchlist({ output: makeOutput({ session: 'EUROPE_CRYPTO' }) });

    await expect(repo.getHumanReportById(id)).resolves.toBe('Daily watchlist summary');
    await expect(repo.getScoreSummaryById(id)).resolves.toEqual({
      aListCount: 1,
      bListCount: 1,
      candidatePoolCount: 1,
      removedDowngradedCount: 1,
      topScore: 88,
      averageAListScore: 88,
    });
    await expect(repo.getQcResultById(id)).resolves.toEqual({
      status: 'pass',
      checks: [],
      blockingIssues: [],
      warnings: [],
    });
  });

  it('rejects duplicate runKey with a controlled error', async () => {
    const prisma = new FakeWatchlistPrisma();
    const repo = new PrismaCryptoDailyWatchlistRepository(prisma);
    const runKey = 'EUROPE_CRYPTO:2026-06-21:daily-watchlist';

    await repo.saveWatchlist({ output: makeOutput({ session: 'EUROPE_CRYPTO' }), runKey });

    await expect(
      repo.saveWatchlist({ output: makeOutput({ id: 'duplicate', session: 'EUROPE_CRYPTO' }), runKey }),
    ).rejects.toBeInstanceOf(DuplicateWatchlistRunError);
  });

  it('validates persisted output on read', async () => {
    const prisma = new FakeWatchlistPrisma();
    const repo = new PrismaCryptoDailyWatchlistRepository(prisma);
    const id = await repo.saveWatchlist({ output: makeOutput({ session: 'EUROPE_CRYPTO' }) });
    prisma.watchlistRows[0]!.outputJson = JSON.stringify({ product: 'bad-data' });

    await expect(repo.getWatchlistById(id)).rejects.toThrow();
  });
});

function makeInput(session: WatchlistInput['run']['session']): WatchlistInput {
  return {
    run: {
      date: '2026-06-21',
      session,
      timezone: 'Europe/Sofia',
      mode: 'manual',
    },
    marketContext: {
      contextSource: 'market_brief',
      sourceOverviewId: 'overview-1',
      marketRegime: 'risk_on',
      btcContext: 'BTC above key levels',
      ethContext: 'ETH neutral',
      macroRisk: 'low',
      leadingNarratives: ['L1 strength'],
      cautionFlags: [],
      dataStatus: 'fresh',
    },
    sourceHealth: {
      marketBrief: {
        status: 'fresh',
        notes: [],
      },
    },
  };
}

function makeOutput(overrides: {
  id?: string;
  session?: CryptoDailyWatchlistOutput['session'];
  status?: CryptoDailyWatchlistOutput['status'];
  generatedAtUtc?: string;
} = {}): CryptoDailyWatchlistOutput {
  return {
    product: 'Crypto Daily Watchlist',
    schemaVersion: '1.0.0',
    id: overrides.id ?? 'watchlist-output-1',
    generatedAtUtc: overrides.generatedAtUtc ?? '2026-06-21T10:00:00.000Z',
    timezone: 'Europe/Sofia',
    session: overrides.session ?? 'EUROPE_CRYPTO',
    status: overrides.status ?? 'complete',
    marketContext: {
      contextSource: 'market_brief',
      sourceOverviewId: 'overview-1',
      generatedAtUtc: '2026-06-21T09:55:00.000Z',
      marketRegime: 'risk_on',
      btcContext: {
        trendState: 'uptrend',
        relativeState: 'leading',
        notes: 'BTC leading risk appetite.',
      },
      ethContext: {
        trendState: 'range',
        ethBtcState: 'neutral',
        notes: 'ETH stable versus BTC.',
      },
      volatilityRegime: 'normal',
      macroRisk: 'low',
      dominantNarratives: ['L1 strength'],
      cautionFlags: [],
    },
    universe: {
      initialAssetCount: 4,
      eligibleAssetCount: 3,
      scoredAssetCount: 3,
      excludedAssetCount: 1,
      notes: [],
    },
    scoring: {
      weights: {
        liquidity: 20,
        volatility: 15,
        relativeStrength: 20,
        sectorStrength: 15,
        catalystQuality: 10,
        technicalStructure: 15,
        riskDataQuality: 5,
      },
      tierThresholds: {
        aListMin: 80,
        bListMin: 65,
        candidatePoolMin: 50,
      },
    },
    watchlist: {
      aList: [makeAListAsset('SOL', 1, 88)],
      bList: [makeBListAsset('LINK', 2, 72)],
      candidatePool: [makeCandidatePoolAsset('ARB', 3, 58)],
      removedDowngraded: [
        {
          symbol: 'DOGE',
          name: 'Dogecoin',
          previousTier: 'CANDIDATE_POOL',
          finalTier: 'EXCLUDED',
          reasonCodes: ['QUALITY_GATE_FAILED'],
          explanation: 'Weak setup quality.',
          relevantMetrics: { score: 42 },
        },
      ],
    },
    sectorMap: [],
    keyCatalysts: [],
    liquidityVolatilityNotes: [],
    traderChecklist: [],
    dataQuality: {
      status: 'complete',
      generatedAtUtc: '2026-06-21T10:00:00.000Z',
      sourceFreshness: [],
      missingSources: [],
      staleSources: [],
      warnings: [],
      assetWarnings: [],
    },
    qualityControl: {
      status: 'pass',
      checks: [],
      blockingIssues: [],
      warnings: [],
    },
    userFacingReport: {
      title: 'Crypto Daily Watchlist',
      summary: 'Daily watchlist summary',
      aListTable: [],
      bListTable: [],
      sectorNotes: '',
      keyWatchConditions: [],
      removedDowngradedNotes: [],
      dataQualityNotes: [],
      disclaimer: 'Not financial advice.',
    },
  };
}

function makeAListAsset(
  symbol: string,
  rank: number,
  score: number,
): CryptoDailyWatchlistOutput['watchlist']['aList'][number] {
  return {
    ...makeAssetBase(symbol, rank, score),
    tier: 'A_LIST',
  };
}

function makeBListAsset(
  symbol: string,
  rank: number,
  score: number,
): CryptoDailyWatchlistOutput['watchlist']['bList'][number] {
  return {
    ...makeAssetBase(symbol, rank, score),
    tier: 'B_LIST',
  };
}

function makeCandidatePoolAsset(
  symbol: string,
  rank: number,
  score: number,
): CryptoDailyWatchlistOutput['watchlist']['candidatePool'][number] {
  return {
    ...makeAssetBase(symbol, rank, score),
    tier: 'CANDIDATE_POOL',
  };
}

function makeAssetBase(
  symbol: string,
  rank: number,
  score: number,
): Omit<CryptoDailyWatchlistOutput['watchlist']['aList'][number], 'tier'> {
  return {
    symbol,
    name: symbol,
    sector: 'Layer 1',
    rank,
    score,
    componentScores: {
      liquidity: makeComponentScore(80),
      volatility: makeComponentScore(75),
      relativeStrength: makeComponentScore(85),
      sectorStrength: makeComponentScore(70),
      catalystQuality: makeComponentScore(65),
      technicalStructure: makeComponentScore(82),
      riskDataQuality: makeComponentScore(90),
    },
    drivers: ['Relative strength'],
    limitations: [],
    evidence: [],
    whyItMattersToday: `${symbol} is in focus today.`,
    observationArea: null,
    watchCondition: null,
    invalidationContext: null,
    riskNotes: [],
    dataQuality: {
      symbol,
      status: 'complete',
      missingFields: [],
      staleFields: [],
      warnings: [],
    },
    isSignal: false,
  };
}

function makeComponentScore(score: number) {
  return {
    score,
    weight: 10,
    contribution: 8,
    evidence: [],
    flags: [],
    metrics: {},
  };
}
