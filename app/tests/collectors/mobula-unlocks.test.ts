import { describe, it, expect, vi, afterEach } from 'vitest';
import { MobulaUnlocksCollector } from '../../src/collectors/mobula-unlocks.collector.js';

afterEach(() => { vi.restoreAllMocks(); });

const now = Math.floor(Date.now() / 1000);
const in24h = now + 24 * 60 * 60;
const in80h = now + 80 * 60 * 60; // outside 72h window

const baseEmission = {
  name: 'Arbitrum', symbol: 'ARB',
  nextEvent: { timestamp: in24h, noOfTokens: [100_000_000] },
};

function makeEmissionsResponse(emissions: object[]): Response {
  return new Response(JSON.stringify(emissions), { status: 200 });
}

function makeMobulaResponse(data: Record<string, object>): Response {
  return new Response(JSON.stringify({ data }), { status: 200 });
}

function stubFetches(emissions: object[], mobulaData: Record<string, object>): void {
  let call = 0;
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
    call++;
    if (call === 1) return Promise.resolve(makeEmissionsResponse(emissions));
    return Promise.resolve(makeMobulaResponse(mobulaData));
  }));
}

describe('MobulaUnlocksCollector', () => {
  it('includes unlock when USD value exceeds 10M', async () => {
    // 100M tokens * $0.15 = $15M > $10M
    stubFetches([baseEmission], { ARB: { price: 0.15, market_cap: 2e9, circulating_supply: 10e9, rank: 50 } });

    const collector = new MobulaUnlocksCollector('key');
    const events = await collector.collect('US_CRYPTO');

    expect(events).toHaveLength(1);
    expect(events[0]?.asset).toBe('ARB');
    expect(events[0]?.source).toBe('defillama-mobula-unlocks');
  });

  it('includes unlock when token count > 1% of circulating supply', async () => {
    // 100M tokens / 5B supply = 2% > 1%
    stubFetches([baseEmission], { ARB: { price: 0.01, market_cap: 50_000_000, circulating_supply: 5_000_000_000, rank: 500 } });

    const collector = new MobulaUnlocksCollector('key');
    const events = await collector.collect('US_CRYPTO');

    expect(events).toHaveLength(1);
  });

  it('includes unlock when token rank is within top 200', async () => {
    // Low USD value but top-200
    stubFetches([baseEmission], { ARB: { price: 0.0001, market_cap: 1e6, circulating_supply: 1e12, rank: 150 } });

    const collector = new MobulaUnlocksCollector('key');
    const events = await collector.collect('US_CRYPTO');

    expect(events).toHaveLength(1);
  });

  it('includes unlock when symbol is in focus list', async () => {
    // Low value, no top-200, but it's a focus symbol
    stubFetches([baseEmission], { ARB: { price: 0.0001, market_cap: 1e6, circulating_supply: 1e12, rank: 999 } });

    const collector = new MobulaUnlocksCollector('key', ['ARBUSDT']);
    const events = await collector.collect('US_CRYPTO');

    expect(events).toHaveLength(1);
  });

  it('excludes unlock when no relevance criteria pass', async () => {
    // Low value, low rank, not in focus, < 1% supply
    stubFetches(
      [{ ...baseEmission, nextEvent: { timestamp: in24h, noOfTokens: [1000] } }],
      { ARB: { price: 0.001, market_cap: 100_000, circulating_supply: 1e12, rank: 999 } },
    );

    const collector = new MobulaUnlocksCollector('key');
    const events = await collector.collect('US_CRYPTO');

    expect(events).toHaveLength(0);
  });

  it('excludes unlocks outside the 72h window', async () => {
    stubFetches(
      [{ ...baseEmission, nextEvent: { timestamp: in80h, noOfTokens: [100_000_000] } }],
      { ARB: { price: 1.0, market_cap: 1e9, rank: 10 } },
    );

    const collector = new MobulaUnlocksCollector('key');
    const events = await collector.collect('US_CRYPTO');

    expect(events).toHaveLength(0);
  });

  it('marks confidence as high when Mobula data is available, medium otherwise', async () => {
    stubFetches([baseEmission], { ARB: { price: 0.15, market_cap: 2e9, rank: 50 } });

    const collector = new MobulaUnlocksCollector('key');
    const events = await collector.collect('US_CRYPTO');

    expect(events[0]?.confidence).toBe('high');
  });

  it('still returns events when Mobula batch returns no data (market undefined)', async () => {
    // With no market data, rank = Infinity so top200 fails, but if there's a focus symbol it still passes
    let call = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      call++;
      if (call === 1) return Promise.resolve(makeEmissionsResponse([baseEmission]));
      return Promise.resolve(new Response(JSON.stringify({ data: {} }), { status: 200 }));
    }));

    const collector = new MobulaUnlocksCollector('key', ['ARBUSDT']);
    const events = await collector.collect('US_CRYPTO');

    expect(events).toHaveLength(1);
    expect(events[0]?.confidence).toBe('medium');
  });

  it('throws when DefiLlama emissions fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Bad Gateway', { status: 502 })));

    const collector = new MobulaUnlocksCollector('key');
    await expect(collector.collect('US_CRYPTO')).rejects.toThrow('502');
  });
});
