import { describe, it, expect, vi, afterEach } from 'vitest';
import { FredClient } from '../../src/collectors/fred-client.js';
import { BojRatesCollector } from '../../src/collectors/boj-rates.collector.js';
import type { CollectorRunContext } from '../../../service/src/ports.js';

const ctx = {} as CollectorRunContext;

afterEach(() => { vi.restoreAllMocks(); vi.resetModules(); });

function makeFredResponse(value: string): object {
  return { observations: [{ value }] };
}

function stubFetch(body: object, status = 200): void {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status })),
  ));
}

describe('BojRatesCollector', () => {
  it('returns bojPolicyRate on success', async () => {
    stubFetch(makeFredResponse('0.10'));

    const collector = new BojRatesCollector('success-key');
    const result = await collector.collect(ctx);

    expect(result.status).toBe('success');
    expect(result.data?.bojPolicyRate).toBeCloseTo(0.1);
    expect(result.itemCount).toBe(1);
  });

  it('returns partial when FRED returns dot (missing value)', async () => {
    stubFetch({ observations: [{ value: '.' }] });

    const collector = new BojRatesCollector('missing-dot-key');
    const result = await collector.collect(ctx);

    expect(result.status).toBe('partial');
  });

  it('returns partial when observations array is empty', async () => {
    stubFetch({ observations: [] });

    const collector = new BojRatesCollector('empty-key');
    const result = await collector.collect(ctx);

    expect(result.status).toBe('partial');
  });

  it('includes dataDate in result', async () => {
    stubFetch(makeFredResponse('0.25'));

    const collector = new BojRatesCollector('date-key');
    const result = await collector.collect(ctx);

    expect(result.data?.dataDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns skipped quota reason when FRED returns 429', async () => {
    stubFetch({}, 429);

    const collector = new BojRatesCollector('quota-key');
    const result = await collector.collect(ctx);

    expect(result.status).toBe('skipped');
    expect(result.reasonCode).toBe('ACCESS_LIMITED_QUOTA');
  });

  it('returns failed transient reason when FRED returns non-quota errors', async () => {
    stubFetch({}, 502);

    const collector = new BojRatesCollector('transient-key');
    const result = await collector.collect(ctx);

    expect(result.status).toBe('failed');
    expect(result.reasonCode).toBe('TRANSIENT_NETWORK_ERROR');
  });

  it('caches FRED 429 results briefly to avoid repeated session bursts', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('Rate limited', { status: 429 }));
    vi.stubGlobal('fetch', fetchSpy);

    const collector = new BojRatesCollector('cache-quota-key');
    await collector.collect(ctx);
    await collector.collect(ctx);

    // Initial request only; second collect is blocked by quota cooldown with no immediate retry.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('uses stale cached BoJ value on 429 and reports freshness', async () => {
    let now = 1_000;
    const client = new FredClient({
      now: () => now,
      quotaCooldownMs: 60_000,
      ttlMsForSeries: () => 1,
    });
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(makeFredResponse('0.30')), { status: 200 }))
      .mockResolvedValue(new Response('Rate limited', { status: 429, statusText: 'Too Many Requests' }));
    vi.stubGlobal('fetch', fetchSpy);

    const collector = new BojRatesCollector('boj-stale-key', client);
    const first = await collector.collect(ctx);
    now += 2_000;
    const second = await collector.collect(ctx);
    now += 1_000;
    const third = await collector.collect(ctx);

    expect(first.status).toBe('success');
    expect(second.status).toBe('partial');
    expect(second.reasonCode).toBe('ACCESS_LIMITED_QUOTA');
    expect(second.data?.bojPolicyRate).toBe(0.3);
    expect(second.dataFreshnessSeconds).toBe(2);
    expect(third.status).toBe('partial');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
