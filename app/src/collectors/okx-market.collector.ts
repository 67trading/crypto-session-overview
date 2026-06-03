import type { CollectorResult, ContextCollector, CollectorRunContext, NormalizedVenueSnapshot } from '../../../service/src/ports.js';
import { getInstrumentsFor } from '../../../service/src/market-normalization/instrument-registry.js';
import { normalizeFundingPer8h } from '../../../service/src/market-normalization/normalize-funding.js';
import { normalizeOiUsd } from '../../../service/src/market-normalization/normalize-open-interest.js';

const BASE = 'https://www.okx.com';
const UA = 'trader-agent/session-overview';

type OkxResponse<T> = { code: string; msg: string; data: T[] };
type OkxTicker = { last: string; open24h: string; high24h: string; low24h: string };
type OkxFunding = { fundingRate: string; nextFundingTime?: string; fundingTime?: string };
type OkxOpenInterest = { oi: string; oiCcy?: string; oiUsd?: string };
type OkxCandle = [string, string, string, string, string, string, string, string, string];

async function fetchOkx<T>(url: URL): Promise<T[]> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`OKX ${url.pathname}: ${res.status} ${res.statusText}`);
  const json = await res.json() as OkxResponse<T>;
  if (json.code !== '0') throw new Error(`OKX ${url.pathname}: ${json.code} ${json.msg}`);
  return json.data;
}

export class OkxMarketCollector implements ContextCollector<NormalizedVenueSnapshot[]> {
  readonly sourceName = 'okx-market';

  async collect(_ctx: CollectorRunContext): Promise<CollectorResult<NormalizedVenueSnapshot[]>> {
    const instruments = getInstrumentsFor('price').filter((entry) => entry.venues.okx !== undefined);
    const results = await Promise.allSettled(instruments.map(async (entry) => {
      const instId = entry.venues.okx!;
      const [tickerRows, fundingRows, oiRows, daily, weekly, fourHour] = await Promise.all([
        this.fetchTicker(instId),
        this.fetchFunding(instId),
        this.fetchOpenInterest(instId),
        this.fetchCandles(instId, '1Dutc', 3),
        this.fetchCandles(instId, '1Wutc', 3),
        this.fetchCandles(instId, '4H', 10),
      ]);
      const ticker = tickerRows[0];
      if (ticker === undefined) throw new Error(`OKX ticker missing for ${instId}`);
      const last = Number(ticker.last);
      const funding = fundingRows[0];
      const oi = oiRows[0];
      const rawOi = oi !== undefined ? Number(oi.oiCcy ?? oi.oi) : undefined;
      const normalizedFunding = funding !== undefined
        ? normalizeFundingPer8h(Number(funding.fundingRate), 8)
        : undefined;
      const normalizedUsd = oi?.oiUsd !== undefined
        ? Number(oi.oiUsd)
        : rawOi !== undefined
        ? normalizeOiUsd({ rawValue: rawOi, rawUnit: 'base', markPrice: last })
        : undefined;
      const change24hPct = Number(ticker.open24h) > 0
        ? ((last - Number(ticker.open24h)) / Number(ticker.open24h)) * 100
        : undefined;
      return {
        venue: 'okx',
        asset: entry.asset,
        canonicalInstrument: entry.canonical,
        venueInstrument: instId,
        instrumentType: 'linear_perp',
        quote: 'USDT',
        observedAt: new Date().toISOString(),
        ticker24h: {
          last,
          open24h: Number(ticker.open24h),
          high24h: Number(ticker.high24h),
          low24h: Number(ticker.low24h),
          ...(change24hPct !== undefined ? { change24hPct } : {}),
          sourceScope: 'single_venue',
          timeBasis: 'rolling_24h',
        },
        candles: [
          ...daily.map((row) => this.toCandle(row, '1d' as const, 'utc_daily_candle' as const)),
          ...weekly.map((row) => this.toCandle(row, '1w' as const, 'utc_weekly_candle' as const)),
          ...fourHour.map((row) => this.toCandle(row, '4h' as const, 'four_hour_candle' as const)),
        ],
        ...(funding !== undefined ? {
          funding: {
            rate: Number(funding.fundingRate),
            intervalHours: 8,
            ...(normalizedFunding !== undefined ? { normalizedPer8h: normalizedFunding } : {}),
            ...(funding.nextFundingTime !== undefined ? { nextFundingTime: new Date(Number(funding.nextFundingTime)).toISOString() } : {}),
            timeBasis: 'unknown' as const,
          },
        } : {}),
        ...(rawOi !== undefined ? {
          openInterest: {
            rawValue: rawOi,
            rawUnit: oi?.oiUsd !== undefined ? 'usd' as const : 'base' as const,
            ...(normalizedUsd !== undefined ? { normalizedUsd } : {}),
            timeBasis: 'unknown' as const,
          },
        } : {}),
        dataQuality: { missingFields: [], stale: false, errors: [] },
      } satisfies NormalizedVenueSnapshot;
    }));

    const snapshots = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
    return { status: snapshots.length === instruments.length ? 'success' : snapshots.length > 0 ? 'partial' : 'failed', data: snapshots, itemCount: snapshots.length };
  }

  private fetchTicker(instId: string): Promise<OkxTicker[]> {
    const url = new URL(`${BASE}/api/v5/market/ticker`);
    url.searchParams.set('instId', instId);
    return fetchOkx<OkxTicker>(url);
  }

  private fetchFunding(instId: string): Promise<OkxFunding[]> {
    const url = new URL(`${BASE}/api/v5/public/funding-rate`);
    url.searchParams.set('instId', instId);
    return fetchOkx<OkxFunding>(url);
  }

  private fetchOpenInterest(instId: string): Promise<OkxOpenInterest[]> {
    const url = new URL(`${BASE}/api/v5/public/open-interest`);
    url.searchParams.set('instType', 'SWAP');
    url.searchParams.set('instId', instId);
    return fetchOkx<OkxOpenInterest>(url);
  }

  private fetchCandles(instId: string, bar: '1Dutc' | '1Wutc' | '4H', limit: number): Promise<OkxCandle[]> {
    const url = new URL(`${BASE}/api/v5/market/candles`);
    url.searchParams.set('instId', instId);
    url.searchParams.set('bar', bar);
    url.searchParams.set('limit', String(limit));
    return fetchOkx<OkxCandle>(url).then((rows) => rows.reverse());
  }

  private toCandle(row: OkxCandle, timeframe: '1d' | '1w' | '4h', timeBasis: NonNullable<NormalizedVenueSnapshot['candles']>[number]['timeBasis']): NonNullable<NormalizedVenueSnapshot['candles']>[number] {
    return {
      timeframe,
      openTime: new Date(Number(row[0])).toISOString(),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      closed: row[8] === '1',
      timeBasis,
    };
  }
}
