import { describe, it, expect, vi, afterEach } from 'vitest';
import { CoinGeckoBreadthCollector } from '../../src/collectors/coingecko-breadth.collector.js';
import type { CollectorRunContext } from '../../../service/src/ports.js';

const fakeCtx: CollectorRunContext = {
  session: 'US_CRYPTO',
  now: new Date('2024-01-01T00:00:00Z'),
  timezone: 'UTC',
  symbols: { core: [], major: [], watch: [] },
  sessionWindow: { start: new Date(), end: new Date() },
  lookaheadHours: 24,
};

function makeCoins(
  changes: Array<number | null>,
): Array<{ id: string; symbol: string; price_change_percentage_24h: number | null }> {
  return changes.map((change, i) => ({
    id: `coin-${i}`,
    symbol: `COIN${i}`,
    price_change_percentage_24h: change,
  }));
}

function mockFetch(body: unknown, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CoinGeckoBreadthCollector', () => {
  it('computes positiveCount and breadthPercent correctly from a mix of positive/negative coins', async () => {
    // 3 positive, 2 negative out of 5 total → 60%
    mockFetch(makeCoins([5, -3, 2, -1, 8]));

    const collector = new CoinGeckoBreadthCollector();
    const result = await collector.collect(fakeCtx);

    expect(result.status).toBe('success');
    expect(result.data?.positiveCount).toBe(3);
    expect(result.data?.totalTracked).toBe(5);
    expect(result.data?.breadthPercent).toBeCloseTo(60);
    expect(result.itemCount).toBe(5);
  });

  it('returns broad_rotation when breadthPercent >= 70', async () => {
    // 7 positive, 3 negative → 70%
    mockFetch(makeCoins([1, 2, 3, 4, 5, 6, 7, -1, -2, -3]));

    const collector = new CoinGeckoBreadthCollector();
    const result = await collector.collect(fakeCtx);

    expect(result.data?.rotationState).toBe('broad_rotation');
    expect(result.data?.breadthLabel).toBe('strong breadth');
  });

  it('returns selective_rotation when breadthPercent is 55-69', async () => {
    // 6 positive, 4 negative out of 10 → 60%
    mockFetch(makeCoins([1, 2, 3, 4, 5, 6, -1, -2, -3, -4]));

    const collector = new CoinGeckoBreadthCollector();
    const result = await collector.collect(fakeCtx);

    expect(result.data?.rotationState).toBe('selective_rotation');
    expect(result.data?.breadthLabel).toBe('moderate breadth');
  });

  it('returns no_rotation when breadthPercent < 25 (very weak)', async () => {
    // 2 positive, 10 negative out of 12 → ~16.7%
    mockFetch(makeCoins([1, 2, -1, -2, -3, -4, -5, -6, -7, -8, -9, -10]));

    const collector = new CoinGeckoBreadthCollector();
    const result = await collector.collect(fakeCtx);

    expect(result.data?.rotationState).toBe('no_rotation');
    expect(result.data?.breadthLabel).toBe('very weak breadth');
  });

  it('returns partial when API returns empty array', async () => {
    mockFetch([]);

    const collector = new CoinGeckoBreadthCollector();
    const result = await collector.collect(fakeCtx);

    expect(result.status).toBe('partial');
    expect(result.itemCount).toBe(0);
    expect(result.data).toBeUndefined();
  });

  it('throws when fetch returns non-200', async () => {
    mockFetch({ error: 'Too many requests' }, 429);

    const collector = new CoinGeckoBreadthCollector();
    await expect(collector.collect(fakeCtx)).rejects.toThrow('429');
  });

  it('filters out coins with null price_change_percentage_24h', async () => {
    // 2 positive, 1 null → totalTracked = 2, positiveCount = 2
    mockFetch(makeCoins([5, 3, null]));

    const collector = new CoinGeckoBreadthCollector();
    const result = await collector.collect(fakeCtx);

    expect(result.status).toBe('success');
    expect(result.data?.totalTracked).toBe(2);
    expect(result.data?.positiveCount).toBe(2);
  });

  it('computes outperformingBtcPct correctly', async () => {
    // BTC = -2%, coin0 = +5% (outperforms BTC), coin1 = -3% (underperforms)
    const coins = [
      { id: 'bitcoin', symbol: 'btc', price_change_percentage_24h: -2 },
      { id: 'coin-0', symbol: 'COIN0', price_change_percentage_24h: 5 },
      { id: 'coin-1', symbol: 'COIN1', price_change_percentage_24h: -3 },
    ];
    mockFetch(coins);
    const collector = new CoinGeckoBreadthCollector();
    const result = await collector.collect(fakeCtx);
    // 1 out of 2 non-BTC coins outperforms BTC → 50%
    expect(result.data?.outperformingBtcPct).toBeCloseTo(50);
  });
});
