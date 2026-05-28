// ─── Domain types (mirrors session-overview-core — unified after merge) ────────

export type CryptoSession = 'ASIA_CRYPTO' | 'EUROPE_CRYPTO' | 'US_CRYPTO';

export type HtfCandle = {
  openTimeMs: number;
  closeTimeMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type NormalizedEventType =
  | 'exchange_listing' | 'exchange_delisting' | 'exchange_maintenance'
  | 'token_unlock' | 'protocol_upgrade' | 'airdrop' | 'governance_vote'
  | 'security_incident' | 'stablecoin_event' | 'etf_related'
  | 'fomc' | 'cpi' | 'ppi' | 'pce' | 'nfp' | 'fed_speaker' | 'macro_other';

export type NormalizedEvent = {
  eventId: string;
  eventType: NormalizedEventType;
  category: string;
  asset?: string;
  exchange?: string;
  title: string;
  scheduledTime?: string;
  detectedAt: string;
  importance: 'critical' | 'high' | 'medium' | 'low';
  sessionRelevance: CryptoSession[];
  source: string;
  summary: string;
  confidence: 'low' | 'medium' | 'high';
  dedupeKey: string;
  relevanceScore: number;
};

export type DerivativesContext = {
  symbol: string;
  fundingStatus:
    | 'negative_extreme' | 'negative_elevated' | 'neutral'
    | 'positive_elevated' | 'positive_extreme' | 'unknown';
  oiStatus: 'falling' | 'stable' | 'rising' | 'rising_fast' | 'unknown';
  positioningStatus: 'long_heavy' | 'short_heavy' | 'balanced' | 'unknown';
};

export type ActiveOverviewSetup = {
  setupId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  setupType: string;
  timeframeSource: 'Weekly' | 'Daily' | '4H' | 'Session';
  status: string;
  relevantZone?: { low: number; high: number };
  invalidation?: number;
};

export type HtfLevelsSnapshot = {
  weekly: {
    currentWeekOpen: number;
    previousWeekHigh: number;
    previousWeekLow: number;
    previousWeekClose: number;
    weeklyMidpoint: number;
    weeklyPosition: 'above_midpoint' | 'at_midpoint' | 'below_midpoint';
  } | null;
  daily: {
    currentDayOpen: number;
    previousDayHigh: number;
    previousDayLow: number;
    previousDayClose: number;
    dailyMidpoint: number;
    dailyPosition: 'above_midpoint' | 'at_midpoint' | 'below_midpoint';
  } | null;
  fourHour: {
    lastSwingHigh: number;
    lastSwingLow: number;
    structure: 'bullish' | 'bearish' | 'range' | 'transition';
    supportZone: { low: number; high: number };
    resistanceZone: { low: number; high: number };
  } | null;
};

export type CollectorDataQuality = {
  name: string;
  status: 'success' | 'partial' | 'failed';
  itemCount: number;
  error?: string;
};

export type DataQualityInfo = {
  collectors: CollectorDataQuality[];
  missingSources: string[];
  failedSources: string[];
};

export type DataStatus = {
  price: DataStatusValue;
  events: DataStatusValue;
  derivatives: DataStatusValue;
  liquidations: DataStatusValue;
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
};

export type DerivativesNarrativeSummary = {
  funding: string;
  oi: string;
  positioning: string;
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
};

export type DataStatusValue = 'fresh' | 'stale' | 'partial' | 'failed' | 'unavailable';

export type MarketRegime =
  | 'risk_on_expansion' | 'constructive_but_extended' | 'defensive_range_bound'
  | 'range_compression' | 'long_heavy_near_resistance' | 'short_heavy_near_support'
  | 'risk_off' | 'event_driven' | 'mixed' | 'unknown';

export type OverviewOutput = {
  briefId: string;
  generatedAtUtc: string;
  session: CryptoSession;
  marketRegime: MarketRegime;
  briefConfidence: 'low' | 'medium' | 'high';
  dataStatus: {
    price: DataStatusValue;
    events: DataStatusValue;
    derivatives: DataStatusValue;
    liquidations: DataStatusValue;
  };
  whatChanged: string[];
  btc: {
    summary: string;
    keyLevels: string[];
    position: string;
    structure: 'bullish' | 'bearish' | 'range' | 'transition' | 'unknown';
  };
  eth: {
    summary: string;
    vsbtc: string;
    keyLevels: string[];
  };
  majorAssets: { symbol: string; summary: string; keyLevels: string[] }[];
  alts: {
    summary: string;
    rotationState: 'broad_rotation' | 'selective_rotation' | 'no_rotation' | 'weak' | 'unknown';
    breadth: string;
  };
  derivatives: {
    summary: string;
    funding: string;
    oi: string;
    positioning: string;
  };
  events: {
    summary: string;
    upcoming: { title: string; time: string; importance: 'critical' | 'high' | 'medium' | 'low' }[];
  };
  scenarios: {
    reclaim: string;
    rejection: string;
    chop: string;
  };
  note: string;
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
  collect(session: CryptoSession): Promise<NormalizedEvent[]>;
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
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  itemCount: number;
  errorMessage?: string;
  durationMs?: number;
  dataFreshnessSeconds?: number;
  fallbackUsed?: boolean;
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
  createdAt?: Date;
};

export type OverviewFilters = {
  session?: CryptoSession;
  limit?: number;
  fromDate?: Date;
};

export type TelegramPostRecord = {
  overviewId: string;
  messageId: string;
  chatId: string;
  session: CryptoSession;
  messageIndex?: number;
  text?: string;
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
  limit?: number;
  fromDate?: Date;
};

export type CollectorRunFilters = {
  collectorName?: string;
  status?: 'SUCCESS' | 'FAILED' | 'SKIPPED';
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
  listOverviews(filters: OverviewFilters): Promise<OverviewRecord[]>;
  saveTelegramPost(post: TelegramPostRecord): Promise<string>;
  saveLlmUsage(usage: LlmUsageRecord): Promise<string>;
  getOverviewById(id: string): Promise<OverviewRecord | null>;
  listEvents(filters: EventFilters): Promise<NormalizedEvent[]>;
  listCollectorRuns(filters: CollectorRunFilters): Promise<CollectorRunRecord[]>;
}

// ─── Publisher port ────────────────────────────────────────────────────────────

export interface OverviewPublisher {
  publish(report: string, session: CryptoSession): Promise<string[]>;
}

// ─── Logger port ──────────────────────────────────────────────────────────────

export type LoggerLike = {
  info(obj: Record<string, unknown> | string, msg?: string): void;
  warn(obj: Record<string, unknown> | string, msg?: string): void;
  error(obj: Record<string, unknown> | string, msg?: string): void;
  debug(obj: Record<string, unknown> | string, msg?: string): void;
};
