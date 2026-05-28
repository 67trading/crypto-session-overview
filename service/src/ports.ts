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
};

export type OverviewOutput = {
  reportId: string;
  createdAt: string;
  session: CryptoSession;
  timezone: string;
  overview: {
    marketTone:
      | 'constructive' | 'constructive_but_extended' | 'neutral'
      | 'mixed' | 'weak' | 'volatile' | 'unknown';
    sessionRead: string;
    confidence: 'low' | 'medium' | 'high';
  };
  btcContext: { summary: string; keyLevels: string[]; currentPosition: string };
  ethContext: { summary: string; ethVsBtc: string };
  altcoinContext: {
    summary: string;
    rotationState: 'broad_rotation' | 'selective_rotation' | 'no_rotation' | 'weak' | 'unknown';
  };
  derivativesContext: {
    summary: string;
    fundingRead: string;
    oiRead: string;
    positioningRead: string;
  };
  eventsContext: {
    summary: string;
    importantEvents: { title: string; importance: 'critical' | 'high' | 'medium'; relevance: string }[];
  };
  assetsInFocus: { symbol: string; reason: string }[];
  setupsInFocus: { setupId: string; symbol: string; reason: string }[];
  levelsToWatch: {
    symbol: string;
    levelType: 'weekly' | 'daily' | '4h' | 'session';
    level: string;
    reason: string;
  }[];
  sessionNotes: string[];
  humanSummary: string;
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
};

export type LlmUsageRecord = {
  overviewId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  durationMs: number;
  promptVersion?: string;
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
