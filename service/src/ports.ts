import type {
  CryptoSession,
  HtfCandle,
  NormalizedEventType,
  EventCategory,
  EventImportance,
  NormalizedEvent,
  DerivativesContext,
  ActiveOverviewSetup,
  HtfLevelsSnapshot,
  OverviewOutput,
  MarketRegime,
  DataStatusValue,
  DataStatus,
} from '../../core/src/index.js';

// ─── Domain types (imported from session-overview-core) ──────────────────────

export type {
  CryptoSession,
  HtfCandle,
  NormalizedEventType,
  EventCategory,
  EventImportance,
  NormalizedEvent,
  DerivativesContext,
  ActiveOverviewSetup,
  HtfLevelsSnapshot,
  OverviewOutput,
  MarketRegime,
  DataStatusValue,
  DataStatus,
} from '../../core/src/index.js';

export type CollectorDataQuality = {
  name: string;
  status: 'success' | 'partial' | 'failed' | 'skipped';
  itemCount: number;
  error?: string;
  reasonCode?: CollectorReasonCode;
};

export type DataQualityInfo = {
  collectors: CollectorDataQuality[];
  missingSources: string[];
  failedSources: string[];
};

export type PrecomputedRegime = {
  marketRegime: MarketRegime;
  briefConfidence: 'low' | 'medium' | 'high';
};

export type AltsBreadthSummary = {
  breadthPercent: number;
  positiveCount: number;
  totalTracked: number;
  breadthLabel: string;
  rotationState: 'broad_rotation' | 'selective_rotation' | 'no_rotation' | 'weak' | 'unknown';
  outperformingBtcPct?: number;
};

export type DerivativesNarrativeSummary = {
  funding: string;
  oi: string;
  positioning: string;
};

export type CrossMarketSummary = {
  ethBtcTrendLabel: string;
  dominanceSignal: 'rising' | 'falling' | 'mixed' | 'unknown';
  dominanceLabel: string;
  topOutperformers: string[];
  topUnderperformers: string[];
};

export type PrecomputedEvents = {
  upcomingEvents: {
    title: string;
    time: string;
    importance: 'critical' | 'high' | 'medium' | 'low';
  }[];
  totalDeduped: number;
  sessionFiltered: number;
  hasCritical: boolean;
};

export type PreviousBriefContext = {
  generatedAtUtc: string;
  marketRegime: MarketRegime;
  briefConfidence: 'low' | 'medium' | 'high';
  btcStructure: 'bullish' | 'bearish' | 'range' | 'transition' | 'unknown';
  btcPosition: string;
  btcSummary: string;
  ethVsbtc: string;
  altRotationState: 'broad_rotation' | 'selective_rotation' | 'no_rotation' | 'weak' | 'unknown';
  altBreadth: string;
  derivativesFunding: string;
  derivativesOi: string;
  derivativesPositioning: string;
  upcomingEventTitles: string[];
};

// ─── Context collector ports ──────────────────────────────────────────────────

export type CollectorRunContext = {
  session: CryptoSession;
  now: Date;
  timezone: string;
  symbols: { core: string[]; major: string[]; watch: string[] };
  sessionWindow: { start: Date; end: Date };
  lookaheadHours: number;
};

export type CollectorReasonCode =
  | 'MISSING_API_KEY'
  | 'ACCESS_LIMITED'
  | 'ACCESS_LIMITED_QUOTA'
  | 'DEPRECATED_ENDPOINT'
  | 'BLOCKED_BY_CLOUDFLARE'
  | 'NO_STABLE_API'
  | 'TRANSIENT_NETWORK_ERROR'
  | 'PARSER_ERROR';

export type CollectorResult<T> = {
  status: 'success' | 'partial' | 'failed' | 'skipped';
  data?: T;
  source?: string;
  payloadHash?: string;
  dataFreshnessSeconds?: number;
  durationMs?: number;
  error?: string;
  reasonCode?: CollectorReasonCode;
  itemCount: number;
};

export interface ContextCollector<TContext> {
  readonly sourceName: string;
  collect(ctx: CollectorRunContext): Promise<CollectorResult<TContext>>;
}

// ─── Structured context types returned by ContextCollectors ──────────────────

export type LiquidityContext = {
  clusters: { price: number; side: 'long' | 'short'; estimatedSizeUsd: number }[];
  dataFreshnessSeconds?: number;
};

export type EtfFlowContext = {
  btcFlowUsd?: number;
  ethFlowUsd?: number;
  date: string;
  source: string;
  sourceAvailable?: boolean;
  btcSourceAvailable?: boolean;
  ethSourceAvailable?: boolean;
  isProxy?: boolean;
};

export type OptionsContext = {
  symbol: string;
  putCallRatio?: number;
  impliedVol24h?: number;
  maxPainStrike?: number;
};

export type MacroRatesContext = {
  fedFundsRate?: number;
  us10yYield?: number;
  us2yYield?: number;
  dxy?: number;
  pceYoY?: number;
  gdpGrowthQoQ?: number;
  pcePriceIndexQoQ?: number;
  ecbDepositRate?: number;
  ecbMainRate?: number;
  eurozoneHicpYoY?: number;
  bojPolicyRate?: number;
  dataDate?: string;
};

export type StablecoinContext = {
  totalSupplyUsd: number;
  dayChangeUsd: number;
  weekChangeUsd: number;
  topStablecoins: { symbol: string; supplyUsd: number; pegStatus: 'pegged' | 'depegged' }[];
  dataDate: string;
};

export type ChainFlowContext = {
  totalTvlUsd: number;
  dayChangePct: number;
  weekChangePct: number;
  topChains: { name: string; tvlUsd: number }[];
  dataDate: string;
};

export type SourceHealthSummary = {
  collectors: {
    name: string;
    source: string;
    status: 'success' | 'partial' | 'failed' | 'skipped';
    itemCount: number;
    durationMs?: number;
    dataFreshnessSeconds?: number;
    payloadHash?: string;
    error?: string;
    reasonCode?: CollectorReasonCode;
  }[];
  healthyCount: number;
  partialCount: number;
  failedCount: number;
  skippedCount: number;
};

export type OverviewInput = {
  request: {
    session: CryptoSession;
    createdAt: string;
    timezone: string;
    allowedTimeframes: readonly ['Weekly', 'Daily', '4H', 'Session'];
    forbiddenTimeframes: readonly ['1H', '15m', '5m'];
  };
  universe: {
    coreSymbols: string[];
    majorSymbols: string[];
    watchSymbols: string[];
  };
  marketContext: {
    btcTone: string;
    ethVsBtc: string;
    btcDominance?: string;
    altcoinRotation?: string;
    totalCryptoTone?: string;
  };
  levels: Record<string, HtfLevelsSnapshot>;
  sessionContext: unknown;
  derivativesContext: Record<string, DerivativesContext>;
  eventsForSession: NormalizedEvent[];
  activeSetups: ActiveOverviewSetup[];
  dataQuality: DataQualityInfo;
  dataStatus?: DataStatus;
  previousBrief?: PreviousBriefContext;
  precomputedRegime?: PrecomputedRegime;
  altsBreadth?: AltsBreadthSummary;
  derivativesNarrative?: DerivativesNarrativeSummary;
  precomputedEvents?: PrecomputedEvents;
  crossMarket?: CrossMarketSummary;
  liquidityContext?: LiquidityContext;
  etfFlowContext?: EtfFlowContext;
  optionsContext?: OptionsContext[];
  macroRatesContext?: MacroRatesContext;
  stablecoinContext?: StablecoinContext;
  chainFlowContext?: ChainFlowContext;
  sourceHealth?: SourceHealthSummary;
};

// ─── Collection ports ──────────────────────────────────────────────────────────

export type OverviewMarketSnapshot = {
  symbol: string;
  latestPrice: number;
  candles: {
    weekly: HtfCandle[];
    daily: HtfCandle[];
    fourHour: HtfCandle[];
  };
};

export interface MarketDataCollector {
  collect(symbols: string[]): Promise<OverviewMarketSnapshot[]>;
}

export interface DerivativesCollector {
  collect(symbols: string[]): Promise<Record<string, DerivativesContext>>;
}

export interface EventCollector {
  readonly sourceName: string;
  collect(ctx: CollectorRunContext): Promise<CollectorResult<NormalizedEvent[]>>;
}

export interface ActiveSetupsLoader {
  loadActive(symbols: string[]): Promise<ActiveOverviewSetup[]>;
}

// ─── LLM port ─────────────────────────────────────────────────────────────────

export type LlmUsageData = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  durationMs: number;
};

export type LlmGenerateResult = {
  output: OverviewOutput;
  usage?: LlmUsageData;
};

export interface LlmOverviewClient {
  readonly modelName: string;
  generateOverview(input: OverviewInput): Promise<LlmGenerateResult>;
}

// ─── Storage port ──────────────────────────────────────────────────────────────

export type CollectorRunRecord = {
  collectorName: string;
  startedAt: Date;
  finishedAt?: Date;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'SKIPPED';
  itemCount: number;
  errorMessage?: string;
  reasonCode?: CollectorReasonCode;
  durationMs?: number;
  dataFreshnessSeconds?: number;
  fallbackUsed?: boolean;
  source?: string;
  payloadHash?: string;
};

export type OverviewRecord = {
  id?: string;
  session: CryptoSession;
  status: 'SUCCESS' | 'FAILED' | 'PARTIAL';
  outputJson: OverviewOutput;
  humanReport?: string;
  inputSnapshotId?: string;
  telegramPostIds?: string[];
  promptVersion?: string;
  model?: string;
  sourceHealth?: SourceHealthSummary;
  dataStatus?: DataStatus;
  sessionWindowStart?: Date;
  sessionWindowEnd?: Date;
  runKey?: string;
  createdAt?: Date;
  crossMarket?: unknown;
  etfFlow?: unknown;
  options?: unknown;
};

export type OverviewFilters = {
  session?: CryptoSession;
  limit?: number;
  fromDate?: Date;
};

export type TelegramPostRecord = {
  overviewId: string;
  messageId?: string;
  chatId: string;
  session: CryptoSession;
  messageIndex?: number;
  text?: string;
  status?: 'SENT' | 'FAILED';
  errorMessage?: string;
};

export type LlmUsageRecord = {
  overviewId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  durationMs: number;
  promptVersion?: string;
  session?: CryptoSession;
  costEstimate?: number;
};

export type EventFilters = {
  session?: CryptoSession;
  eventType?: string;
  asset?: string;
  source?: string;
  category?: string;
  importance?: string;
  limit?: number;
  fromDate?: Date;
};

export type TelegramPostFilters = {
  overviewId?: string;
  session?: string;
  limit?: number;
};

export type CollectorRunFilters = {
  collectorName?: string;
  status?: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'SKIPPED';
  limit?: number;
  fromDate?: Date;
};

export interface SessionOverviewRepository {
  saveInputSnapshot(session: CryptoSession, input: OverviewInput): Promise<string>;
  saveCollectedEvents(events: NormalizedEvent[]): Promise<void>;
  saveCollectorRun(run: CollectorRunRecord): Promise<void>;
  saveOverview(record: OverviewRecord): Promise<string>;
  updateOverviewTelegramPosts(id: string, postIds: string[]): Promise<void>;
  getLatestOverview(session: CryptoSession): Promise<OverviewRecord | null>;
  getOverviewByRunKey(runKey: string): Promise<OverviewRecord | null>;
  listOverviews(filters: OverviewFilters): Promise<OverviewRecord[]>;
  saveTelegramPost(post: TelegramPostRecord): Promise<string>;
  saveLlmUsage(usage: LlmUsageRecord): Promise<string>;
  getOverviewById(id: string): Promise<OverviewRecord | null>;
  listEvents(filters: EventFilters): Promise<NormalizedEvent[]>;
  listCollectorRuns(filters: CollectorRunFilters): Promise<CollectorRunRecord[]>;
  listTelegramPosts(filters: TelegramPostFilters): Promise<TelegramPostRecord[]>;
}

// ─── Publisher port ────────────────────────────────────────────────────────────

export interface OverviewPublisher {
  readonly chatId?: string;
  publish(report: string, session: CryptoSession): Promise<string[]>;
}

// ─── Logger port ──────────────────────────────────────────────────────────────

export type LoggerLike = {
  info(obj: Record<string, unknown> | string, msg?: string): void;
  warn(obj: Record<string, unknown> | string, msg?: string): void;
  error(obj: Record<string, unknown> | string, msg?: string): void;
  debug(obj: Record<string, unknown> | string, msg?: string): void;
};
