import { BybitHttpClient } from './bybit-http-client.js';
import { BybitMarketDataCollector } from './collectors/bybit-market-data.js';
import { BybitDerivativesCollector } from './collectors/bybit-derivatives.js';
import { BybitAnnouncementsCollector } from './collectors/bybit-announcements.js';
import { FedCalendarCollector } from './collectors/fed-calendar.collector.js';
import { BlsCalendarCollector } from './collectors/bls-calendar.collector.js';
import { SecRssCollector } from './collectors/sec-rss.collector.js';
import { CoinMarketCalCollector } from './collectors/coinmarketcal.collector.js';
import { BinanceAnnouncementsCollector } from './collectors/binance-announcements.collector.js';
import { TokenUnlocksCollector } from './collectors/token-unlocks.collector.js';
import { MobulaUnlocksCollector } from './collectors/mobula-unlocks.collector.js';
import { DeribitOptionsCollector } from './collectors/deribit-options.collector.js';
import { FarsideEtfCollector } from './collectors/farside-etf.collector.js';
import { CoinGeckoBreadthCollector } from './collectors/coingecko-breadth.collector.js';
import { FredRatesCollector } from './collectors/fred-rates.collector.js';
import { BeaGdpCollector } from './collectors/bea-gdp.collector.js';
import { EcbRatesCollector } from './collectors/ecb-rates.collector.js';
import { EurostatInflationCollector } from './collectors/eurostat-inflation.collector.js';
import { BojRatesCollector } from './collectors/boj-rates.collector.js';
import { DefiLlamaStablecoinsCollector } from './collectors/defillama-stablecoins.collector.js';
import { DefiLlamaChainsCollector } from './collectors/defillama-chains.collector.js';
import { AnthropicLlmClient } from './llm-client.js';
import { PrismaSessionOverviewRepository } from './repository.js';
import { TelegramPublisher } from './telegram-publisher.js';
import { PrismaActiveSetupsLoader } from './setup-loader/active-setups-loader.js';
import { SessionOverviewService } from '../../service/src/session-overview.service.js';
import { OverviewRunner } from '../../service/src/overview-runner.js';
import {
  mergeMacroRatesContext,
  mergeStablecoinContext,
  mergeChainFlowContext,
  mergeOptionsContext,
  mergeEtfFlowContext,
  mergeBreadthContext,
  contextCollectorEntry,
} from '../../service/src/context-merge.js';
import type { AppConfig } from './config.js';
import type { LoggerLike } from '../../service/src/ports.js';
import type { SessionOverviewDeps, ContextCollectorEntry } from '../../service/src/service-types.js';

function toCoinSlug(symbol: string): string {
  // 'BTCUSDT' → 'bitcoin', 'ETHUSDT' → 'ethereum', etc.
  const map: Record<string, string> = {
    BTCUSDT: 'bitcoin', ETHUSDT: 'ethereum', SOLUSDT: 'solana',
    BNBUSDT: 'binance-coin', XRPUSDT: 'ripple', DOGEUSDT: 'dogecoin',
    ADAUSDT: 'cardano', AVAXUSDT: 'avalanche', DOTUSDT: 'polkadot',
    LINKUSDT: 'chainlink', MATICUSDT: 'polygon', UNIUSDT: 'uniswap',
    ARBUSDT: 'arbitrum', OPUSDT: 'optimism', SEIUSDT: 'sei-network',
    SUIUSDT: 'sui', APTUSDT: 'aptos', INJUSDT: 'injective-protocol',
  };
  return map[symbol] ?? symbol.replace('USDT', '').toLowerCase();
}

function buildCoinSlugList(symbols: { core: string[]; major: string[]; watch: string[] }): string {
  const all = [...new Set([...symbols.core, ...symbols.major])];
  return all.map(toCoinSlug).join(',');
}

export function wire(config: AppConfig, logger: LoggerLike): SessionOverviewService {
  const bybitClient = new BybitHttpClient(
    config.bybit.baseUrl,
    config.bybit.apiKey,
    config.bybit.apiSecret,
  );

  const marketDataCollector = new BybitMarketDataCollector(bybitClient);
  const derivativesCollector = new BybitDerivativesCollector(bybitClient);
  const eventCollectors = [
    new BybitAnnouncementsCollector(bybitClient),
    new FedCalendarCollector(),
    new BlsCalendarCollector(),
    new SecRssCollector(),
    new BinanceAnnouncementsCollector(),
    // Mobula replaces the plain DefiLlama unlock collector when API key is set
    ...(config.mobula !== undefined
      ? [new MobulaUnlocksCollector(config.mobula.apiKey, [
          ...config.symbols.core, ...config.symbols.major,
        ])]
      : [new TokenUnlocksCollector()]),
  ];

  const coinmarketcalApiKey = process.env['COINMARKETCAL_API_KEY'];
  if (coinmarketcalApiKey !== undefined && coinmarketcalApiKey !== '') {
    eventCollectors.push(new CoinMarketCalCollector(coinmarketcalApiKey, buildCoinSlugList(config.symbols)));
  }

  // Context collectors — always-on (public), or gated on API keys (FRED, BEA)
  const contextCollectors: ContextCollectorEntry[] = [
    contextCollectorEntry(new DefiLlamaStablecoinsCollector(), mergeStablecoinContext),
    contextCollectorEntry(new DefiLlamaChainsCollector(), mergeChainFlowContext),
    contextCollectorEntry(new DeribitOptionsCollector(), mergeOptionsContext),
    contextCollectorEntry(new FarsideEtfCollector(), mergeEtfFlowContext),
    contextCollectorEntry(new CoinGeckoBreadthCollector(), mergeBreadthContext),
    // Europe/Asia macro — public APIs, no key needed
    contextCollectorEntry(new EcbRatesCollector(), mergeMacroRatesContext),
    contextCollectorEntry(new EurostatInflationCollector(), mergeMacroRatesContext),
  ];
  if (config.fred !== undefined) {
    contextCollectors.push(contextCollectorEntry(new FredRatesCollector(config.fred.apiKey), mergeMacroRatesContext));
    // BoJ rate via FRED (reuses FRED key)
    contextCollectors.push(contextCollectorEntry(new BojRatesCollector(config.fred.apiKey), mergeMacroRatesContext));
  }
  if (config.bea !== undefined) {
    contextCollectors.push(contextCollectorEntry(new BeaGdpCollector(config.bea.apiKey), mergeMacroRatesContext));
  }

  const llmClient = new AnthropicLlmClient(config.anthropic.apiKey, config.anthropic.model);
  const repository = new PrismaSessionOverviewRepository(config.database.url);
  const setupLoader = new PrismaActiveSetupsLoader(config.database.url);

  const deps: SessionOverviewDeps = {
    marketDataCollector,
    derivativesCollector,
    eventCollectors,
    contextCollectors,
    setupLoader,
    llmClient,
    repository,
    logger,
    ...(config.telegram.enabled
      ? {
          publisher: new TelegramPublisher(
            config.telegram.botToken,
            config.telegram.chatId,
          ),
        }
      : {}),
  };

  const runner = new OverviewRunner(deps);
  return new SessionOverviewService(runner, repository);
}
