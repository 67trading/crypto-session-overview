import type { CollectorResult, ContextCollector, CollectorRunContext, NormalizedVenueSnapshot } from '../../../service/src/ports.js';
import { getInstrumentsFor } from '../../../service/src/market-normalization/instrument-registry.js';
import { normalizeFundingPer8h } from '../../../service/src/market-normalization/normalize-funding.js';
import { normalizeOiUsd } from '../../../service/src/market-normalization/normalize-open-interest.js';

const BASE = 'https://fapi.binance.com';
const UA = 'trader-agent/session-overview';

type BinanceTicker24h = {
  lastPrice: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  priceChangePercent: string;
};
type BinanceFunding = { fundingRate: string; fundingTime: number };
type BinanceOpenInterest = { openInterest: string; time: number };
type BinanceOpenInterestHist = { sumOpenInterest: string; sumOpenInterestValue: string; timestamp: number };
type BinanceKline = [number, string, string, string, string, string, number];

async function fetchJson<T>(url: URL): Promise<T> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Binance ${url.pathname}: ${res.status} ${res.statusText}`);
  return await res.json() as T;
}

export class BinanceMarketCollector implements ContextCollector<NormalizedVenueSnapshot[]> {
  readonly sourceName = 'binance-market';

  async collect(_ctx: CollectorRunContext): Promise<CollectorResult<NormalizedVenueSnapshot[]>> {
    const instruments = getInstrumentsFor('price').filter((entry) => entry.venues.binance !== undefined);
    const results = await Promise.allSettled(instruments.map(async (entry) => {
      const symbol = entry.venues.binance!;
      const [ticker, fundingRows, oi, oiHistory, daily, weekly, fourHour] = await Promise.all([
        this.fetchTicker(symbol),
        this.fetchFunding(symbol),
        this.fetchOpenInterest(symbol),
        this.fetchOpenInterestHistory(symbol),
        this.fetchKlines(symbol, '1d', 3),
        this.fetchKlines(symbol, '1w', 3),
        this.fetchKlines(symbol, '4h', 10),
      ]);
      const last = Number(ticker.lastPrice);
      const rawOi = Number(oi.openInterest);
      const normalizedUsd = normalizeOiUsd({ rawValue: rawOi, rawUnit: 'base', markPrice: last });
      const latestFunding = fundingRows[0];
      const normalizedFunding = latestFunding !== undefined
        ? normalizeFundingPer8h(Number(latestFunding.fundingRate), 8)
        : undefined;
      const latestOiHistory = oiHistory.at(-1);
      const priorOiHistory = oiHistory.at(-2);
      const oiChange24hPct = latestOiHistory !== undefined && priorOiHistory !== undefined && Number(priorOiHistory.sumOpenInterest) !== 0
        ? ((Number(latestOiHistory.sumOpenInterest) - Number(priorOiHistory.sumOpenInterest)) / Number(priorOiHistory.sumOpenInterest)) * 100
        : undefined;
      return {
        venue: 'binance',
        asset: entry.asset,
        canonicalInstrument: entry.canonical,
        venueInstrument: symbol,
        instrumentType: 'linear_perp',
        quote: 'USDT',
        observedAt: new Date().toISOString(),
        ticker24h: {
          last,
          open24h: Number(ticker.openPrice),
          high24h: Number(ticker.highPrice),
          low24h: Number(ticker.lowPrice),
          change24hPct: Number(ticker.priceChangePercent),
          sourceScope: 'single_venue',
          timeBasis: 'rolling_24h',
        },
        candles: [
          ...daily.map((row) => this.toCandle(row, '1d' as const, 'utc_daily_candle' as const)),
          ...weekly.map((row) => this.toCandle(row, '1w' as const, 'utc_weekly_candle' as const)),
          ...fourHour.map((row) => this.toCandle(row, '4h' as const, 'four_hour_candle' as const)),
        ],
        ...(latestFunding !== undefined ? {
          funding: {
            rate: Number(latestFunding.fundingRate),
            intervalHours: 8,
            ...(normalizedFunding !== undefined ? { normalizedPer8h: normalizedFunding } : {}),
            timeBasis: 'unknown' as const,
          },
        } : {}),
        openInterest: {
          rawValue: rawOi,
          rawUnit: 'base',
          ...(normalizedUsd !== undefined ? { normalizedUsd } : {}),
          ...(oiChange24hPct !== undefined ? { change24hPct: oiChange24hPct } : {}),
          timeBasis: oiChange24hPct !== undefined ? 'utc_daily_candle' : 'unknown',
        },
        dataQuality: { missingFields: [], stale: false, errors: [] },
      } satisfies NormalizedVenueSnapshot;
    }));

    const snapshots = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
    return { status: snapshots.length === instruments.length ? 'success' : snapshots.length > 0 ? 'partial' : 'failed', data: snapshots, itemCount: snapshots.length };
  }

  private fetchTicker(symbol: string): Promise<BinanceTicker24h> {
    const url = new URL(`${BASE}/fapi/v1/ticker/24hr`);
    url.searchParams.set('symbol', symbol);
    return fetchJson<BinanceTicker24h>(url);
  }

  private fetchFunding(symbol: string): Promise<BinanceFunding[]> {
    const url = new URL(`${BASE}/fapi/v1/fundingRate`);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('limit', '1');
    return fetchJson<BinanceFunding[]>(url);
  }

  private fetchOpenInterest(symbol: string): Promise<BinanceOpenInterest> {
    const url = new URL(`${BASE}/fapi/v1/openInterest`);
    url.searchParams.set('symbol', symbol);
    return fetchJson<BinanceOpenInterest>(url);
  }

  private fetchOpenInterestHistory(symbol: string): Promise<BinanceOpenInterestHist[]> {
    const url = new URL(`${BASE}/futures/data/openInterestHist`);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('period', '1d');
    url.searchParams.set('limit', '2');
    return fetchJson<BinanceOpenInterestHist[]>(url);
  }

  private fetchKlines(symbol: string, interval: '1d' | '1w' | '4h', limit: number): Promise<BinanceKline[]> {
    const url = new URL(`${BASE}/fapi/v1/klines`);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('interval', interval);
    url.searchParams.set('limit', String(limit));
    return fetchJson<BinanceKline[]>(url);
  }

  private toCandle(row: BinanceKline, timeframe: '1d' | '1w' | '4h', timeBasis: NonNullable<NormalizedVenueSnapshot['candles']>[number]['timeBasis']): NonNullable<NormalizedVenueSnapshot['candles']>[number] {
    return {
      timeframe,
      openTime: new Date(row[0]).toISOString(),
      closeTime: new Date(row[6]).toISOString(),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      closed: row[6] <= Date.now(),
      timeBasis,
    };
  }
}
