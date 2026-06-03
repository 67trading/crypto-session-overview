import type {
  CryptoSession,
  OverviewInput,
  OverviewMarketSnapshot,
  DerivativesContext,
  NormalizedEvent,
  ActiveOverviewSetup,
  HtfLevelsSnapshot,
  DataQualityInfo,
  DataStatus,
  PreviousBriefContext,
  PrecomputedRegime,
  BtcPresentationContext,
  AltsBreadthSummary,
  DerivativesNarrativeSummary,
  PrecomputedEvents,
  CrossMarketSummary,
  LiquidityContext,
  EtfFlowContext,
  OptionsContext,
  MacroRatesContext,
  StablecoinContext,
  ChainFlowContext,
  SourceHealthSummary,
  NormalizedVenueSnapshot,
  CrossVenueConsensus,
} from './ports.js';

export class OverviewInputBuilder {
  build(params: {
    session: CryptoSession;
    symbols: { core: string[]; major: string[]; watch: string[] };
    marketSnapshots: OverviewMarketSnapshot[];
    derivativesContext: Record<string, DerivativesContext>;
    events: NormalizedEvent[];
    activeSetups: ActiveOverviewSetup[];
    sessionContext: unknown;
    levels: Record<string, HtfLevelsSnapshot>;
    tokenBudget: number;
    dataQuality: DataQualityInfo;
    dataStatus?: DataStatus;
    previousBrief?: PreviousBriefContext;
    precomputedRegime?: PrecomputedRegime;
    precomputedBtcPresentation?: BtcPresentationContext;
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
    normalizedVenueSnapshots?: NormalizedVenueSnapshot[];
    crossVenueConsensus?: CrossVenueConsensus;
  }): OverviewInput {
    const btcSnapshot = params.marketSnapshots.find((s) => s.symbol === 'BTCUSDT');
    const ethSnapshot = params.marketSnapshots.find((s) => s.symbol === 'ETHUSDT');

    // Determine BTC tone from price vs weekly/daily midpoints
    const btcTone = this.deriveBtcTone(btcSnapshot, params.levels['BTCUSDT']);
    const ethVsBtc = this.deriveEthVsBtcRead(btcSnapshot, ethSnapshot);

    // Sort events by relevanceScore DESC
    const sortedEvents = [...params.events].sort((a, b) => b.relevanceScore - a.relevanceScore);

    const input: OverviewInput = {
      request: {
        session: params.session,
        createdAt: new Date().toISOString(),
        timezone: 'UTC',
        allowedTimeframes: ['Weekly', 'Daily', '4H', 'Session'],
        forbiddenTimeframes: ['1H', '15m', '5m'],
      },
      universe: {
        coreSymbols: params.symbols.core,
        majorSymbols: params.symbols.major,
        watchSymbols: params.symbols.watch,
      },
      marketContext: {
        btcTone,
        ethVsBtc,
      },
      levels: params.levels,
      sessionContext: params.sessionContext,
      derivativesContext: params.derivativesContext,
      eventsForSession: sortedEvents,
      activeSetups: params.activeSetups,
      dataQuality: params.dataQuality,
      ...(params.dataStatus !== undefined ? { dataStatus: params.dataStatus } : {}),
      ...(params.previousBrief !== undefined ? { previousBrief: params.previousBrief } : {}),
      ...(params.precomputedRegime !== undefined ? { precomputedRegime: params.precomputedRegime } : {}),
      ...(params.precomputedBtcPresentation !== undefined ? { precomputedBtcPresentation: params.precomputedBtcPresentation } : {}),
      ...(params.altsBreadth !== undefined ? { altsBreadth: params.altsBreadth } : {}),
      ...(params.derivativesNarrative !== undefined ? { derivativesNarrative: params.derivativesNarrative } : {}),
      ...(params.precomputedEvents !== undefined ? { precomputedEvents: params.precomputedEvents } : {}),
      ...(params.crossMarket !== undefined ? { crossMarket: params.crossMarket } : {}),
      ...(params.liquidityContext !== undefined ? { liquidityContext: params.liquidityContext } : {}),
      ...(params.etfFlowContext !== undefined ? { etfFlowContext: params.etfFlowContext } : {}),
      ...(params.optionsContext !== undefined ? { optionsContext: params.optionsContext } : {}),
      ...(params.macroRatesContext !== undefined ? { macroRatesContext: params.macroRatesContext } : {}),
      ...(params.stablecoinContext !== undefined ? { stablecoinContext: params.stablecoinContext } : {}),
      ...(params.chainFlowContext !== undefined ? { chainFlowContext: params.chainFlowContext } : {}),
      ...(params.sourceHealth !== undefined ? { sourceHealth: params.sourceHealth } : {}),
      ...(params.normalizedVenueSnapshots !== undefined ? { normalizedVenueSnapshots: params.normalizedVenueSnapshots } : {}),
      ...(params.crossVenueConsensus !== undefined ? { crossVenueConsensus: params.crossVenueConsensus } : {}),
    };

    // Apply token budget: truncate events and setups if needed
    return this.applyTokenBudget(input, params.tokenBudget);
  }

  private deriveBtcTone(
    btcSnapshot: OverviewMarketSnapshot | undefined,
    btcLevels: HtfLevelsSnapshot | undefined
  ): string {
    if (btcSnapshot === undefined || btcLevels === undefined) return 'unknown';
    const price = btcSnapshot.latestPrice;
    const weekly = btcLevels.weekly;
    const daily = btcLevels.daily;
    if (weekly !== null && price > weekly.previousWeekHigh) return 'bullish_breakout';
    if (weekly !== null && price < weekly.previousWeekLow) return 'bearish_breakdown';
    if (daily !== null && price > daily.dailyMidpoint) return 'constructive';
    if (daily !== null && price < daily.dailyMidpoint) return 'weak';
    return 'neutral';
  }

  private deriveEthVsBtcRead(
    btcSnapshot: OverviewMarketSnapshot | undefined,
    ethSnapshot: OverviewMarketSnapshot | undefined
  ): string {
    if (btcSnapshot === undefined || ethSnapshot === undefined) return 'unknown';
    // Compare recent closes to determine relative strength
    const btcCandle = btcSnapshot.candles.daily.at(-1);
    const ethCandle = ethSnapshot.candles.daily.at(-1);
    if (btcCandle === undefined || ethCandle === undefined) return 'unknown';
    const btcReturn = (btcCandle.close - btcCandle.open) / btcCandle.open;
    const ethReturn = (ethCandle.close - ethCandle.open) / ethCandle.open;
    const diff = ethReturn - btcReturn;
    if (diff > 0.01) return 'outperforming';
    if (diff < -0.01) return 'underperforming';
    return 'in_line';
  }

  private applyTokenBudget(input: OverviewInput, maxTokens: number): OverviewInput {
    const estimate = (v: unknown) => Math.ceil(JSON.stringify(v).length / 4);
    if (estimate(input) <= maxTokens) return input;

    // Truncate events first
    let events = input.eventsForSession;
    for (let n = events.length - 1; n >= 0; n--) {
      events = input.eventsForSession.slice(0, n);
      const candidate = { ...input, eventsForSession: events };
      if (estimate(candidate) <= maxTokens) return candidate;
    }

    // Then truncate setups
    let setups = input.activeSetups;
    for (let n = setups.length - 1; n >= 0; n--) {
      setups = input.activeSetups.slice(0, n);
      const candidate = { ...input, eventsForSession: [], activeSetups: setups };
      if (estimate(candidate) <= maxTokens) return candidate;
    }

    return { ...input, eventsForSession: [], activeSetups: [] };
  }
}
