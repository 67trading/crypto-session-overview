import { describe, expect, it } from 'vitest';
import { buildCrossVenueConsensus } from '../src/cross-venue-consensus-builder.js';
import type { NormalizedVenueSnapshot, Venue } from '../src/ports.js';

type PerpVenue = Exclude<Venue, 'deribit'>;

function btcSnapshot(venue: PerpVenue, params: {
  priceChange?: number;
  funding?: number;
  oiChange?: number;
}): NormalizedVenueSnapshot {
  return {
    venue,
    asset: 'BTC',
    canonicalInstrument: 'BTC-PERP-USDT',
    venueInstrument: venue === 'okx' ? 'BTC-USDT-SWAP' : 'BTCUSDT',
    instrumentType: 'linear_perp',
    quote: 'USDT',
    observedAt: '2026-06-03T09:00:00.000Z',
    ticker24h: {
      last: 66000,
      ...(params.priceChange !== undefined ? { change24hPct: params.priceChange } : {}),
      sourceScope: 'single_venue',
      timeBasis: 'rolling_24h',
    },
    ...(params.funding !== undefined ? {
      funding: { rate: params.funding, normalizedPer8h: params.funding, timeBasis: 'unknown' },
    } : {}),
    ...(params.oiChange !== undefined ? {
      openInterest: {
        rawValue: 100,
        rawUnit: 'base',
        normalizedUsd: 6600000,
        change24hPct: params.oiChange,
        timeBasis: 'utc_daily_candle',
      },
    } : {}),
    dataQuality: { missingFields: [], stale: false, errors: [] },
  };
}

describe('buildCrossVenueConsensus()', () => {
  it('confirms neutral derivatives when required venues agree', () => {
    const result = buildCrossVenueConsensus([
      btcSnapshot('bybit', { priceChange: -3, funding: 0.0001, oiChange: 0.5 }),
      btcSnapshot('binance', { priceChange: -3.2, funding: 0.0002, oiChange: 0.2 }),
      btcSnapshot('okx', { priceChange: -2.9, funding: 0.0001, oiChange: 0.1 }),
    ]);

    expect(result.price.direction).toBe('bearish');
    expect(result.derivatives.funding.verificationStatus).toBe('confirmed_cross_venue');
    expect(result.derivatives.openInterest.verificationStatus).toBe('confirmed_cross_venue');
    expect(result.derivatives.combinedLabel).toBe('cross_venue_neutral');
    expect(result.derivatives.confidenceContribution).toBe(1);
  });

  it('marks single-source coverage as source-scoped', () => {
    const result = buildCrossVenueConsensus([
      btcSnapshot('bybit', { priceChange: -3, funding: 0.0001, oiChange: 0.5 }),
    ]);

    expect(result.derivatives.funding.coverageScore).toBe(0.33);
    expect(result.derivatives.funding.verificationStatus).toBe('source_scoped');
    expect(result.derivatives.combinedLabel).toBe('single_source');
  });

  it('does not treat present-only OI snapshots as neutral trend', () => {
    const result = buildCrossVenueConsensus([{
      ...btcSnapshot('binance', { priceChange: -3, funding: 0.0001 }),
      openInterest: {
        rawValue: 100,
        rawUnit: 'base',
        normalizedUsd: 6600000,
        timeBasis: 'unknown',
      },
    }]);

    expect(result.derivatives.openInterest.direction).toBe('unavailable');
    expect(result.derivatives.openInterest.verificationStatus).toBe('unavailable');
    expect(result.derivatives.openInterest.perVenue.find((row) => row.venue === 'binance')?.reason).toBe('OI present without change window');
    expect(result.derivatives.combinedLabel).toBe('single_source');
  });

  it('does not label derivatives cross-venue neutral when only funding is cross-venue confirmed', () => {
    const result = buildCrossVenueConsensus([
      btcSnapshot('bybit', { priceChange: -3, funding: 0.0001 }),
      btcSnapshot('binance', { priceChange: -3.2, funding: 0.0002, oiChange: 0.2 }),
      btcSnapshot('okx', { priceChange: -2.9, funding: 0.0001 }),
    ]);

    expect(result.derivatives.funding.verificationStatus).toBe('confirmed_cross_venue');
    expect(result.derivatives.openInterest.verificationStatus).toBe('source_scoped');
    expect(result.derivatives.combinedLabel).toBe('single_source');
  });

  it('flags cross-venue conflicts as ambiguous', () => {
    const result = buildCrossVenueConsensus([
      btcSnapshot('bybit', { priceChange: -3, funding: 0.001, oiChange: 6 }),
      btcSnapshot('binance', { priceChange: -3, funding: -0.001, oiChange: -2 }),
      btcSnapshot('okx', { priceChange: -3, funding: 0.0001, oiChange: 0.1 }),
    ]);

    expect(result.derivatives.funding.direction).toBe('mixed');
    expect(result.derivatives.funding.verificationStatus).toBe('ambiguous');
    expect(result.derivatives.funding.conflicts).toEqual([]);
    expect(result.derivatives.combinedLabel).toBe('mixed');
  });
});
