import { describe, it, expect, vi, afterEach } from 'vitest';
import { BojRatesCollector } from '../../src/collectors/boj-rates.collector.js';
import type { CollectorRunContext } from '../../../service/src/ports.js';

const ctx = {} as CollectorRunContext;

afterEach(() => { vi.restoreAllMocks(); });

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

    const collector = new BojRatesCollector('test-key');
    const result = await collector.collect(ctx);

    expect(result.status).toBe('success');
    expect(result.data?.bojPolicyRate).toBeCloseTo(0.1);
    expect(result.itemCount).toBe(1);
  });

  it('returns partial when FRED returns dot (missing value)', async () => {
    stubFetch({ observations: [{ value: '.' }] });

    const collector = new BojRatesCollector('test-key');
    const result = await collector.collect(ctx);

    expect(result.status).toBe('partial');
  });

  it('returns partial when observations array is empty', async () => {
    stubFetch({ observations: [] });

    const collector = new BojRatesCollector('test-key');
    const result = await collector.collect(ctx);

    expect(result.status).toBe('partial');
  });

  it('includes dataDate in result', async () => {
    stubFetch(makeFredResponse('0.25'));

    const collector = new BojRatesCollector('test-key');
    const result = await collector.collect(ctx);

    expect(result.data?.dataDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('throws when FRED returns non-200', async () => {
    stubFetch({}, 403);

    const collector = new BojRatesCollector('test-key');
    await expect(collector.collect(ctx)).rejects.toThrow('403');
  });
});
