import { describe, it, expect, vi, afterEach } from 'vitest';
import type { CollectorRunContext } from '../../../service/src/ports.js';
import { MobulaUnlocksCollector } from '../../src/collectors/mobula-unlocks.collector.js';

afterEach(() => { vi.restoreAllMocks(); });

const ctx = {
  symbols: { core: ['BTCUSDT', 'ETHUSDT'], major: ['SOLUSDT'], watch: [] },
} as CollectorRunContext;

const now = Math.floor(Date.now() / 1000);
const in24h = now + 24 * 60 * 60;
const in80h = now + 80 * 60 * 60;

function metadata(overrides: Record<string, unknown> = {}): object {
  return {
    name: 'Arbitrum',
    symbol: 'ARB',
    price: 0.15,
    circulating_supply: 10_000_000_000,
    rank: 50,
    release_schedule: [{ timestamp: in24h, tokens: 100_000_000 }],
    ...overrides,
  };
}

function mockMetadataResponse(data: unknown, status = 200): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data }), { status })));
}

describe('MobulaUnlocksCollector', () => {
  it('skips when MOBULA_API_KEY is missing', async () => {
    const result = await new MobulaUnlocksCollector(undefined).collect(ctx);

    expect(result.status).toBe('skipped');
    expect(result.reasonCode).toBe('MISSING_API_KEY');
  });

  it('includes unlock when USD value exceeds 10M', async () => {
    mockMetadataResponse([metadata()]);

    const result = await new MobulaUnlocksCollector('key').collect(ctx);

    expect(result.status).toBe('success');
    expect(result.data).toHaveLength(1);
    expect(result.data?.[0]?.asset).toBe('ARB');
    expect(result.data?.[0]?.source).toBe('mobula-unlocks');
  });

  it('parses array-valued token amount fields', async () => {
    mockMetadataResponse([metadata({
      release_schedule: [{ timestamp: in24h, noOfTokens: [100_000_000] }],
    })]);

    const result = await new MobulaUnlocksCollector('key').collect(ctx);

    expect(result.data).toHaveLength(1);
  });

  it('includes unlock when token count exceeds 1% of circulating supply', async () => {
    mockMetadataResponse([metadata({ price: 0.01, circulating_supply: 5_000_000_000, rank: 500 })]);

    const result = await new MobulaUnlocksCollector('key').collect(ctx);

    expect(result.data).toHaveLength(1);
  });

  it('includes unlock when token rank is within top 200', async () => {
    mockMetadataResponse([metadata({ price: 0.0001, circulating_supply: 1_000_000_000_000, rank: 150 })]);

    const result = await new MobulaUnlocksCollector('key').collect(ctx);

    expect(result.data).toHaveLength(1);
  });

  it('includes unlock when symbol is in focus list', async () => {
    mockMetadataResponse([metadata({ price: 0.0001, circulating_supply: 1_000_000_000_000, rank: 999 })]);

    const result = await new MobulaUnlocksCollector('key', ['ARBUSDT']).collect(ctx);

    expect(result.data).toHaveLength(1);
  });

  it('excludes unlock when no relevance criteria pass', async () => {
    mockMetadataResponse([metadata({
      price: 0.001,
      circulating_supply: 1_000_000_000_000,
      rank: 999,
      release_schedule: [{ timestamp: in24h, tokens: 1000 }],
    })]);

    const result = await new MobulaUnlocksCollector('key').collect(ctx);

    expect(result.data).toHaveLength(0);
  });

  it('excludes unlocks outside the 72h window', async () => {
    mockMetadataResponse([metadata({ release_schedule: [{ timestamp: in80h, tokens: 100_000_000 }] })]);

    const result = await new MobulaUnlocksCollector('key').collect(ctx);

    expect(result.data).toHaveLength(0);
  });

  it('maps access and quota failures to skipped reason codes', async () => {
    mockMetadataResponse({}, 429);

    const result = await new MobulaUnlocksCollector('key').collect(ctx);

    expect(result.status).toBe('skipped');
    expect(result.reasonCode).toBe('ACCESS_LIMITED_QUOTA');
  });

  it('maps malformed metadata to parser skipped', async () => {
    mockMetadataResponse(null);

    const result = await new MobulaUnlocksCollector('key').collect(ctx);

    expect(result.status).toBe('skipped');
    expect(result.reasonCode).toBe('PARSER_ERROR');
  });

  it('throws on transient Mobula 5xx failures', async () => {
    mockMetadataResponse({}, 502);

    await expect(new MobulaUnlocksCollector('key').collect(ctx)).rejects.toThrow('502');
  });
});
