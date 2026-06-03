import { describe, it, expect, vi, afterEach } from 'vitest';
import { DeribitOptionsCollector } from '../../src/collectors/deribit-options.collector.js';
import type { CollectorRunContext } from '../../../service/src/ports.js';

const ctx = {} as CollectorRunContext;

function makeInstrument(
  strike: number,
  type: 'C' | 'P',
  oi: number,
  iv = 65.0,
  expiry = 'FRONT',
  spot = 95000,
) {
  return {
    instrument_name: `BTC-${expiry}-${strike}-${type}`,
    open_interest: oi,
    mark_iv: iv,
    underlying_price: spot,
  };
}

function makeDeribitResponse(instruments: object[]): Response {
  return new Response(JSON.stringify({ result: instruments }), { status: 200 });
}

afterEach(() => { vi.restoreAllMocks(); });

describe('DeribitOptionsCollector', () => {
  it('computes put/call ratio from open interest', async () => {
    const instruments = [
      makeInstrument(90000, 'C', 1000),
      makeInstrument(95000, 'C', 2000),
      makeInstrument(100000, 'C', 1000),
      makeInstrument(90000, 'P', 1200),
      makeInstrument(95000, 'P', 1800),
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeDeribitResponse(instruments)));

    const collector = new DeribitOptionsCollector();
    const result = await collector.collect(ctx);

    expect(result.status).toBe('success');
    // calls OI = 4000, puts OI = 3000 → PCR = 0.75
    expect(result.data?.[0]?.putCallRatio).toBeCloseTo(0.75, 2);
  });

  it('finds ATM IV for the front expiry', async () => {
    const spot = 95000;
    // Use date-format expiry labels so string sort gives correct order: 07MAR25 < 28MAR25
    const instruments = [
      makeInstrument(90000, 'C', 500, 70.0, '07MAR25', spot),
      makeInstrument(95000, 'C', 500, 65.0, '07MAR25', spot), // ATM, front expiry
      makeInstrument(100000, 'C', 500, 68.0, '07MAR25', spot),
      makeInstrument(90000, 'C', 500, 72.0, '28MAR25', spot), // far expiry — ignored
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeDeribitResponse(instruments)));

    const collector = new DeribitOptionsCollector();
    const result = await collector.collect(ctx);

    expect(result.data?.[0]?.impliedVol24h).toBe(65.0);
  });

  it('computes max pain as the strike minimising total option pain', async () => {
    // Simple case: 1 call at K=90000, 1 put at K=100000
    // For candidate S=90000: callPain=0, putPain=10000*1=10000 → total=10000
    // For candidate S=100000: callPain=10000*1=10000, putPain=0 → total=10000
    // For candidate S=95000: callPain=5000*1, putPain=5000*1 → total=10000
    // They're all equal — just ensure it returns one of the strikes
    const instruments = [
      makeInstrument(90000, 'C', 1),
      makeInstrument(100000, 'P', 1),
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeDeribitResponse(instruments)));

    const collector = new DeribitOptionsCollector();
    const result = await collector.collect(ctx);

    expect([90000, 100000]).toContain(result.data?.[0]?.maxPainStrike);
  });

  it('returns expiry-aware selected max pain metadata', async () => {
    const instruments = [
      makeInstrument(90000, 'C', 1, 65, '07JUN26'),
      makeInstrument(100000, 'P', 1, 65, '07JUN26'),
      makeInstrument(110000, 'C', 10, 65, '28JUN26'),
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeDeribitResponse(instruments)));

    const collector = new DeribitOptionsCollector();
    const result = await collector.collect(ctx);

    expect(result.data?.[0]).toEqual(expect.objectContaining({
      source: 'deribit',
      currency: 'BTC',
      expiryScope: 'front_expiry',
      verificationStatus: 'confirmed_single_source',
      selectedMaxPain: expect.objectContaining({
        expiryDate: '07JUN26',
        instrumentsIncluded: 2,
      }),
    }));
  });

  it('returns BTC as the symbol for the first item', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      makeDeribitResponse([makeInstrument(90000, 'C', 100)]),
    ));

    const collector = new DeribitOptionsCollector();
    const result = await collector.collect(ctx);

    expect(result.data?.[0]?.symbol).toBe('BTC');
  });

  it('returns both BTC and ETH when both APIs succeed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
      Promise.resolve(makeDeribitResponse([makeInstrument(90000, 'C', 1000)])),
    ));
    const collector = new DeribitOptionsCollector();
    const result = await collector.collect(ctx);
    expect(result.status).toBe('success');
    // 2 currencies: BTC + ETH (mock returns same data for both)
    expect(result.data?.length).toBe(2);
  });

  it('returns partial when result array is empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ result: [] }), { status: 200 }),
    ));

    const collector = new DeribitOptionsCollector();
    const result = await collector.collect(ctx);

    expect(result.status).toBe('partial');
  });

  it('returns partial when Deribit returns non-200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Too Many Requests', { status: 429 })));

    const collector = new DeribitOptionsCollector();
    const result = await collector.collect(ctx);
    expect(result.status).toBe('partial');
  });
});
