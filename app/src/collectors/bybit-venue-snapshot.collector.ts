import type { CollectorResult, ContextCollector, CollectorRunContext, NormalizedVenueSnapshot } from '../../../service/src/ports.js';
import { getInstrumentsFor } from '../../../service/src/market-normalization/instrument-registry.js';
import { normalizeFundingPer8h } from '../../../service/src/market-normalization/normalize-funding.js';
import { normalizeOiUsd } from '../../../service/src/market-normalization/normalize-open-interest.js';
import type { BybitHttpClient, BybitKline } from '../bybit-http-client.js';

export class BybitVenueSnapshotCollector implements ContextCollector<NormalizedVenueSnapshot[]> {
  readonly sourceName = 'bybit-venue-snapshots';

  constructor(private readonly client: BybitHttpClient) {}

  async collect(_ctx: CollectorRunContext): Promise<CollectorResult<NormalizedVenueSnapshot[]>> {
    const instruments = getInstrumentsFor('price').filter((entry) => entry.venues.bybit !== undefined);
    const results = await Promise.allSettled(instruments.map(async (entry) => {
      const symbol = entry.venues.bybit!;
      const [ticker, fundingRows, oiRows, daily, weekly, fourHour] = await Promise.all([
        this.client.getTicker(symbol, 'linear'),
        this.client.getFundingRateHistory(symbol, 1),
        this.client.getOpenInterest(symbol, '1d'),
        this.client.getKlines(symbol, 'D', 3, 'linear'),
        this.client.getKlines(symbol, 'W', 3, 'linear'),
        this.client.getKlines(symbol, '240', 10, 'linear'),
      ]);
      const latestFunding = fundingRows[0];
      const latestOi = oiRows[0];
      const priorOi = oiRows[1];
      const oiChangePct = latestOi !== undefined && priorOi !== undefined && priorOi.openInterest !== 0
        ? ((latestOi.openInterest - priorOi.openInterest) / priorOi.openInterest) * 100
        : undefined;
      const normalizedFunding = latestFunding !== undefined
        ? normalizeFundingPer8h(latestFunding.fundingRate, 8)
        : undefined;
      const normalizedUsd = latestOi !== undefined
        ? normalizeOiUsd({ rawValue: latestOi.openInterest, rawUnit: 'base', markPrice: ticker.lastPrice })
        : undefined;

      return {
        venue: 'bybit',
        asset: entry.asset,
        canonicalInstrument: entry.canonical,
        venueInstrument: symbol,
        instrumentType: 'linear_perp',
        quote: 'USDT',
        observedAt: new Date().toISOString(),
        ticker24h: {
          last: ticker.lastPrice,
          ...(ticker.prevPrice24h !== undefined ? { open24h: ticker.prevPrice24h } : {}),
          ...(ticker.highPrice24h !== undefined ? { high24h: ticker.highPrice24h } : {}),
          ...(ticker.lowPrice24h !== undefined ? { low24h: ticker.lowPrice24h } : {}),
          ...(ticker.price24hPcnt !== undefined ? { change24hPct: ticker.price24hPcnt } : {}),
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
            rate: latestFunding.fundingRate,
            intervalHours: 8,
            ...(normalizedFunding !== undefined ? { normalizedPer8h: normalizedFunding } : {}),
            timeBasis: 'unknown' as const,
          },
        } : {}),
        ...(latestOi !== undefined ? {
          openInterest: {
            rawValue: latestOi.openInterest,
            rawUnit: 'base' as const,
            ...(normalizedUsd !== undefined ? { normalizedUsd } : {}),
            ...(oiChangePct !== undefined ? { change24hPct: oiChangePct } : {}),
            timeBasis: oiChangePct !== undefined ? 'utc_daily_candle' as const : 'unknown' as const,
          },
        } : {}),
        dataQuality: { missingFields: [], stale: false, errors: [] },
      } satisfies NormalizedVenueSnapshot;
    }));

    const snapshots = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
    return { status: snapshots.length === instruments.length ? 'success' : snapshots.length > 0 ? 'partial' : 'failed', data: snapshots, itemCount: snapshots.length };
  }

  private toCandle(row: BybitKline, timeframe: '1d' | '1w' | '4h', timeBasis: NonNullable<NormalizedVenueSnapshot['candles']>[number]['timeBasis']): NonNullable<NormalizedVenueSnapshot['candles']>[number] {
    return {
      timeframe,
      openTime: new Date(row.openTimeMs).toISOString(),
      closeTime: new Date(row.closeTimeMs).toISOString(),
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      closed: row.closeTimeMs <= Date.now(),
      timeBasis,
    };
  }
}
