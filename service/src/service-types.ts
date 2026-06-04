import type {
  CryptoSession,
  OverviewOutput,
  OverviewRecord,
  OverviewFilters,
  MarketDataCollector,
  DerivativesCollector,
  EventCollector,
  ActiveSetupsLoader,
  LlmOverviewClient,
  SessionOverviewRepository,
  OverviewPublisher,
  LoggerLike,
  ContextCollector,
  CollectorResult,
  OverviewInput,
} from './ports.js';

export type ContextCollectorEntry = {
  collector: ContextCollector<unknown>;
  merge: (input: OverviewInput, result: CollectorResult<unknown>) => OverviewInput;
};

export type SessionOverviewDeps = {
  marketDataCollector: MarketDataCollector;
  derivativesCollector: DerivativesCollector;
  eventCollectors: EventCollector[];
  contextCollectors?: ContextCollectorEntry[];
  setupLoader?: ActiveSetupsLoader;
  llmClient: LlmOverviewClient;
  repository: SessionOverviewRepository;
  publisher?: OverviewPublisher;
  logger: LoggerLike;
};

export type OverviewRunOptions = {
  session: CryptoSession;
  symbols: {
    core: string[];
    major: string[];
    watch: string[];
  };
  publish?: boolean;
  tokenBudget?: number;
  force?: boolean;
  targetSessionDate?: string;
  now?: Date;
};

export type OverviewRunResult = {
  overviewId: string;
  session: CryptoSession;
  status: 'SUCCESS' | 'FAILED' | 'PARTIAL' | 'PUBLISHED_DEGRADED';
  output?: OverviewOutput;
  humanReport?: string;
  telegramPostIds?: string[];
  durationMs: number;
  error?: string;
  telegramPublished: boolean;
  marketRegime?: string;
  briefConfidence?: string;
  collectorStatus: Record<string, 'success' | 'partial' | 'failed' | 'skipped'>;
};

export type { OverviewRecord, OverviewFilters };
