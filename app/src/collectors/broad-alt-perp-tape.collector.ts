import type { AltsBreadthSummary, CollectorResult, CollectorRunContext, ContextCollector, Venue } from '../../../service/src/ports.js';
import { MIN_BROAD_ALT_UNIVERSE_SIZE, unavailableBroadAltPerpTape } from '../../../service/src/alts-breadth-analyzer.js';

const UA = 'trader-agent/session-overview';
const MIN_24H_VOLUME_USD = 25_000_000;
const MIN_VENUES_PER_ASSET = 2;
const EXCLUDED_BASES = new Set([
  'BTC', 'ETH',
  'USDT', 'USDC', 'FDUSD', 'DAI', 'TUSD', 'BUSD',
  'WBTC', 'WETH', 'STETH', 'WSTETH',
]);
const LEVERAGED_SUFFIXES = ['UP', 'DOWN', 'BULL', 'BEAR', '2L', '2S', '3L', '3S', '5L', '5S'];
const NON_CRYPTO_BASES = new Set([
  // Tokenized stocks / equity perps occasionally share the USDT perp tape.
  'AAPL', 'AMD', 'AMZN', 'BILL', 'CRCL', 'GOOGL', 'INTC', 'META', 'MRVL', 'MSTR', 'MU', 'NFLX', 'NVDA', 'SNDK', 'TSLA', 'UB',
  // Metals / commodity proxies are not crypto alt breadth.
  'XAG', 'XAU', 'XAUT',
]);

type AltPerpTicker = {
  venue: Exclude<Venue, 'deribit'>;
  asset: string;
  symbol: string;
  change24hPct: number;
  volume24hUsd: number;
};

type BybitTicker = {
  symbol: string;
  lastPrice: string;
  price24hPcnt?: string;
  turnover24h?: string;
};

type BinanceTicker = {
  symbol: string;
  priceChangePercent: string;
  quoteVolume: string;
};

type OkxTicker = {
  instId: string;
  last: string;
  sodUtc0?: string;
  volCcy24h?: string;
};

type BybitResponse<T> = { retCode: number; retMsg: string; result: { list: T[] } };
type OkxResponse<T> = { code: string; msg: string; data: T[] };

async function fetchJson<T>(url: URL): Promise<T> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${url.hostname}${url.pathname}: ${res.status} ${res.statusText}`);
  return await res.json() as T;
}
function isEligibleBase(asset: string): boolean {
  if (EXCLUDED_BASES.has(asset)) return false;
  if (NON_CRYPTO_BASES.has(asset)) return false;
  return !LEVERAGED_SUFFIXES.some((suffix) => asset.endsWith(suffix));
}

function bybitAsset(symbol: string): string | undefined {
  if (!symbol.endsWith('USDT')) return undefined;
  return symbol.slice(0, -4);
}

function binanceAsset(symbol: string): string | undefined {
  if (!symbol.endsWith('USDT')) return undefined;
  return symbol.slice(0, -4);
}

function okxAsset(instId: string): string | undefined {
  const match = /^([A-Z0-9]+)-USDT-SWAP$/.exec(instId);
  return match?.[1];
}

function rotationState(pctPositive: number): AltsBreadthSummary['rotationState'] {
  if (pctPositive >= 65) return 'broad_rotation';
  if (pctPositive >= 40) return 'selective_rotation';
  if (pctPositive >= 25) return 'weak';
  return 'no_rotation';
}

function marketLabel(state: AltsBreadthSummary['rotationState']): string {
  if (state === 'broad_rotation') return 'broad perp rotation';
  if (state === 'selective_rotation') return 'mixed perp rotation';
  if (state === 'weak') return 'broad perp weakness';
  if (state === 'no_rotation') return 'weak perp tape';
  return 'unavailable';
}

function buildBreadth(tickers: AltPerpTicker[]): AltsBreadthSummary {
  const byAsset = new Map<string, AltPerpTicker[]>();
  for (const ticker of tickers) {
    const current = byAsset.get(ticker.asset) ?? [];
    current.push(ticker);
    byAsset.set(ticker.asset, current);
  }

  const eligible = [...byAsset.entries()]
    .map(([asset, rows]) => ({
      asset,
      rows,
      venues: new Set(rows.map((row) => row.venue)),
      avgChange: rows.reduce((sum, row) => sum + row.change24hPct, 0) / rows.length,
    }))
    .filter((entry) => entry.venues.size >= MIN_VENUES_PER_ASSET);

  if (eligible.length < MIN_BROAD_ALT_UNIVERSE_SIZE) {
    return unavailableBroadAltPerpTape(`only ${eligible.length} eligible assets after filters`, eligible.length);
  }

  const positiveCount = eligible.filter((entry) => entry.avgChange > 0).length;
  const negativeCount = eligible.filter((entry) => entry.avgChange < 0).length;
  const neutralCount = eligible.length - positiveCount - negativeCount;
  const breadthPercent = Math.round((positiveCount / eligible.length) * 100);
  const state = rotationState(breadthPercent);

  return {
    breadthPercent,
    positiveCount,
    negativeCount,
    neutralCount,
    totalTracked: eligible.length,
    breadthLabel: `${breadthPercent}% of ${eligible.length} liquid alt perps positive on 24h`,
    rotationState: state,
    sourceScope: 'broad_alt_perp_tape',
    universeName: 'Bybit/Binance/OKX liquid USDT perp tape',
    basketName: 'broad_alt_perp_tape',
    symbols: eligible.map((entry) => entry.asset),
    timeBasis: 'rolling_24h',
    minVolumeUsd: MIN_24H_VOLUME_USD,
    venues: ['bybit', 'binance', 'okx'],
    canRenderBroadLabel: true,
  };
}

export class BroadAltPerpTapeCollector implements ContextCollector<AltsBreadthSummary> {
  readonly sourceName = 'broad-alt-perp-tape';

  async collect(_ctx: CollectorRunContext): Promise<CollectorResult<AltsBreadthSummary>> {
    const results = await Promise.allSettled([
      this.fetchBybit(),
      this.fetchBinance(),
      this.fetchOkx(),
    ]);
    const tickers = results.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
    const data = buildBreadth(tickers);
    const failed = results.filter((result) => result.status === 'rejected').length;
    const status = tickers.length === 0 ? 'failed' : failed > 0 || data.canRenderBroadLabel === false ? 'partial' : 'success';
    return {
      status,
      data,
      itemCount: data.totalTracked,
      source: this.sourceName,
    };
  }

  private async fetchBybit(): Promise<AltPerpTicker[]> {
    const url = new URL('https://api.bybit.com/v5/market/tickers');
    url.searchParams.set('category', 'linear');
    const body = await fetchJson<BybitResponse<BybitTicker>>(url);
    if (body.retCode !== 0) throw new Error(`Bybit alt perp tape: ${body.retCode} ${body.retMsg}`);
    return body.result.list.flatMap((row) => {
      const asset = bybitAsset(row.symbol);
      const change = row.price24hPcnt !== undefined ? Number(row.price24hPcnt) * 100 : NaN;
      const volume = row.turnover24h !== undefined ? Number(row.turnover24h) : NaN;
      if (asset === undefined || !isEligibleBase(asset) || !Number.isFinite(change) || !Number.isFinite(volume) || volume < MIN_24H_VOLUME_USD) return [];
      return [{ venue: 'bybit', asset, symbol: row.symbol, change24hPct: change, volume24hUsd: volume }];
    });
  }

  private async fetchBinance(): Promise<AltPerpTicker[]> {
    const url = new URL('https://fapi.binance.com/fapi/v1/ticker/24hr');
    const body = await fetchJson<BinanceTicker[]>(url);
    return body.flatMap((row) => {
      const asset = binanceAsset(row.symbol);
      const change = Number(row.priceChangePercent);
      const volume = Number(row.quoteVolume);
      if (asset === undefined || !isEligibleBase(asset) || !Number.isFinite(change) || !Number.isFinite(volume) || volume < MIN_24H_VOLUME_USD) return [];
      return [{ venue: 'binance', asset, symbol: row.symbol, change24hPct: change, volume24hUsd: volume }];
    });
  }

  private async fetchOkx(): Promise<AltPerpTicker[]> {
    const url = new URL('https://www.okx.com/api/v5/market/tickers');
    url.searchParams.set('instType', 'SWAP');
    const body = await fetchJson<OkxResponse<OkxTicker>>(url);
    if (body.code !== '0') throw new Error(`OKX alt perp tape: ${body.code} ${body.msg}`);
    return body.data.flatMap((row) => {
      const asset = okxAsset(row.instId);
      const last = Number(row.last);
      const open = row.sodUtc0 !== undefined ? Number(row.sodUtc0) : NaN;
      const baseVolume = row.volCcy24h !== undefined ? Number(row.volCcy24h) : NaN;
      const change = Number.isFinite(last) && Number.isFinite(open) && open > 0 ? ((last - open) / open) * 100 : NaN;
      const volume = Number.isFinite(baseVolume) && Number.isFinite(last) ? baseVolume * last : NaN;
      if (asset === undefined || !isEligibleBase(asset) || !Number.isFinite(change) || !Number.isFinite(volume) || volume < MIN_24H_VOLUME_USD) return [];
      return [{ venue: 'okx', asset, symbol: row.instId, change24hPct: change, volume24hUsd: volume }];
    });
  }
}
