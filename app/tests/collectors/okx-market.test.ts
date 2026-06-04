import { describe, expect, it, vi } from 'vitest';
import { OkxMarketCollector } from '../../src/collectors/okx-market.collector.js';
import type { VenueSnapshotRepository, VenueSnapshotRecord } from '../../../service/src/ports.js';

function okxResponse(data: unknown[]): Response {
  return new Response(JSON.stringify({ code: '0', msg: '', data }), { status: 200 });
}

function candle(ts: number): string[] {
  return [String(ts), '100', '110', '90', '105', '1', '1', '1', '1'];
}

describe('OkxMarketCollector', () => {
  it('computes OI change from previous persisted OKX snapshot and saves the current snapshot', async () => {
    const repository: VenueSnapshotRepository = {
      getPreviousVenueSnapshot: vi.fn(async (query) => ({
        venue: 'okx',
        asset: query.asset,
        metric: 'open_interest',
        value: query.asset === 'BTC' ? 100 : 200,
        observedAt: new Date(query.before.getTime() - 24 * 60 * 60 * 1000),
      } satisfies VenueSnapshotRecord)),
      saveVenueSnapshot: vi.fn(async () => undefined),
    };
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      const parsed = new URL(String(url));
      const instId = parsed.searchParams.get('instId');
      if (parsed.pathname === '/api/v5/market/ticker') {
        return okxResponse([{ last: instId?.startsWith('BTC') ? '1000' : '500', open24h: '990', high24h: '1010', low24h: '980' }]);
      }
      if (parsed.pathname === '/api/v5/public/funding-rate') {
        return okxResponse([{ fundingRate: '0.0001', nextFundingTime: '1780567200000' }]);
      }
      if (parsed.pathname === '/api/v5/public/open-interest') {
        return okxResponse([{ oi: instId?.startsWith('BTC') ? '110' : '220', oiCcy: instId?.startsWith('BTC') ? '110' : '220' }]);
      }
      if (parsed.pathname === '/api/v5/market/candles') {
        return okxResponse([candle(1780567200000), candle(1780480800000), candle(1780394400000)]);
      }
      return new Response('Not found', { status: 404 });
    }));

    const result = await new OkxMarketCollector(repository).collect({
      session: 'EUROPE_CRYPTO',
      now: new Date('2026-06-04T10:00:00.000Z'),
    });

    expect(result.status).toBe('success');
    const btc = result.data?.find((snapshot) => snapshot.asset === 'BTC');
    expect(btc?.openInterest?.change24hPct).toBe(10);
    expect(btc?.openInterest?.rawUnit).toBe('base');
    expect(btc?.openInterest?.timeBasis).toBe('rolling_24h');
    expect(repository.getPreviousVenueSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      venue: 'okx',
      asset: 'BTC',
      metric: 'open_interest',
    }));
    expect(repository.saveVenueSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      venue: 'okx',
      asset: 'BTC',
      metric: 'open_interest',
      value: 110,
      source: 'okx-market',
      venueInstrument: 'BTC-USDT-SWAP',
    }));
  });
});
