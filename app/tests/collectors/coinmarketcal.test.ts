import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

const API_KEY = 'test-api-key';

function makeEvent(overrides: Partial<{
  id: number;
  title: string;
  date_event: string;
  created_date: string;
  coins: Array<{ fullname: string; symbol: string }>;
  categories: Array<{ name: string }>;
  percentage: number;
  description: string;
}> = {}) {
  return {
    id: overrides.id ?? 1,
    title: { en: overrides.title ?? 'Test Event' },
    description: overrides.description !== undefined ? { en: overrides.description } : undefined,
    date_event: overrides.date_event ?? '2024-06-01T12:00:00Z',
    created_date: overrides.created_date ?? '2024-05-01T00:00:00Z',
    coins: overrides.coins ?? [{ fullname: 'Bitcoin', symbol: 'BTC' }],
    categories: overrides.categories ?? [{ name: 'Protocol' }],
    can_occur_before: false,
    percentage: overrides.percentage ?? 70,
  };
}

function mockFetch(body: unknown, status = 200): ReturnType<typeof vi.fn> {
  const spy = vi.fn().mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
  vi.stubGlobal('fetch', spy);
  return spy;
}

// Each test resets modules so the module-level cache starts empty
beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CoinMarketCalCollector', () => {
  it('returns NormalizedEvent[] with correct eventType from categories', async () => {
    const events = [
      makeEvent({ id: 1, categories: [{ name: 'Protocol' }, { name: 'Upgrade' }], percentage: 70 }),
      makeEvent({ id: 2, categories: [{ name: 'Airdrop' }], percentage: 60 }),
      makeEvent({ id: 3, categories: [{ name: 'Exchange' }, { name: 'Listing' }], percentage: 55 }),
    ];
    mockFetch({ body: events });

    const { CoinMarketCalCollector } = await import(
      '../../src/collectors/coinmarketcal.collector.js'
    );
    const collector = new CoinMarketCalCollector(API_KEY);
    const result = await collector.collect('US_CRYPTO');

    expect(result).toHaveLength(3);
    expect(result[0]?.eventType).toBe('protocol_upgrade');
    expect(result[1]?.eventType).toBe('airdrop');
    expect(result[2]?.eventType).toBe('exchange_listing');
  });

  it('does NOT include coins= in URL when no coins param provided', async () => {
    const fetchSpy = mockFetch({ body: [makeEvent()] });

    const { CoinMarketCalCollector } = await import(
      '../../src/collectors/coinmarketcal.collector.js'
    );
    const collector = new CoinMarketCalCollector(API_KEY);
    await collector.collect('US_CRYPTO');

    expect(fetchSpy).toHaveBeenCalledOnce();
    const calledUrl: string = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).not.toContain('coins=');
  });

  it('includes coins= in URL when coins param is provided', async () => {
    const fetchSpy = mockFetch({ body: [makeEvent()] });

    const { CoinMarketCalCollector } = await import(
      '../../src/collectors/coinmarketcal.collector.js'
    );
    const collector = new CoinMarketCalCollector(API_KEY, 'bitcoin,ethereum');
    await collector.collect('US_CRYPTO');

    expect(fetchSpy).toHaveBeenCalledOnce();
    const calledUrl: string = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('coins=');
  });

  it('importanceFor returns critical for percentage >= 90', async () => {
    const events = [
      makeEvent({ id: 10, percentage: 95 }),
      makeEvent({ id: 11, percentage: 90 }),
    ];
    mockFetch({ body: events });

    const { CoinMarketCalCollector } = await import(
      '../../src/collectors/coinmarketcal.collector.js'
    );
    const collector = new CoinMarketCalCollector(API_KEY);
    const result = await collector.collect('US_CRYPTO');

    expect(result[0]?.importance).toBe('critical');
    expect(result[1]?.importance).toBe('critical');
  });

  it('importanceFor returns high for percentage 80-89', async () => {
    const events = [
      makeEvent({ id: 20, percentage: 85 }),
      makeEvent({ id: 21, percentage: 80 }),
    ];
    mockFetch({ body: events });

    const { CoinMarketCalCollector } = await import(
      '../../src/collectors/coinmarketcal.collector.js'
    );
    const collector = new CoinMarketCalCollector(API_KEY);
    const result = await collector.collect('US_CRYPTO');

    expect(result[0]?.importance).toBe('high');
    expect(result[1]?.importance).toBe('high');
  });

  it('uses cache: second call with same session should not call fetch again within TTL', async () => {
    const fetchSpy = mockFetch({ body: [makeEvent({ id: 99 })] });

    const { CoinMarketCalCollector } = await import(
      '../../src/collectors/coinmarketcal.collector.js'
    );
    const collector = new CoinMarketCalCollector(API_KEY);
    await collector.collect('US_CRYPTO');
    await collector.collect('US_CRYPTO');

    // Second call hits module-level cache, fetch called only once
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('throws on non-200 response', async () => {
    mockFetch({ error: 'Unauthorized' }, 401);

    const { CoinMarketCalCollector } = await import(
      '../../src/collectors/coinmarketcal.collector.js'
    );
    const collector = new CoinMarketCalCollector(API_KEY);
    await expect(collector.collect('US_CRYPTO')).rejects.toThrow('401');
  });
});
