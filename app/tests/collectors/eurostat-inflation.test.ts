import { describe, it, expect, vi, afterEach } from 'vitest';
import { EurostatInflationCollector } from '../../src/collectors/eurostat-inflation.collector.js';
import type { CollectorRunContext } from '../../../service/src/ports.js';

const ctx = {} as CollectorRunContext;

afterEach(() => { vi.restoreAllMocks(); });

function makeEurostatJson(timePeriods: Record<string, number>, values: Record<string, number>): object {
  return {
    value: values,
    dimension: {
      time: {
        category: {
          index: timePeriods,
        },
      },
    },
  };
}

function stubFetch(body: object, status = 200): void {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status })),
  ));
}

describe('EurostatInflationCollector', () => {
  it('extracts the latest HICP value from a two-period response', async () => {
    // Two periods: Dec 2024 (index 0 = 2.4%) and Jan 2025 (index 1 = 2.2%)
    stubFetch(makeEurostatJson(
      { '2024-12': 0, '2025-01': 1 },
      { '0': 2.4, '1': 2.2 },
    ));

    const collector = new EurostatInflationCollector();
    const result = await collector.collect(ctx);

    expect(result.status).toBe('success');
    expect(result.data?.eurozoneHicpYoY).toBeCloseTo(2.2);
    expect(result.itemCount).toBe(1);
  });

  it('handles a single-period response', async () => {
    stubFetch(makeEurostatJson({ '2025-02': 0 }, { '0': 2.6 }));

    const collector = new EurostatInflationCollector();
    const result = await collector.collect(ctx);

    expect(result.data?.eurozoneHicpYoY).toBeCloseTo(2.6);
  });

  it('picks the lexicographically latest time key when periods are out of order', async () => {
    // Suppose we get three periods; latest by string sort is 2025-03
    stubFetch(makeEurostatJson(
      { '2025-01': 0, '2025-03': 2, '2025-02': 1 },
      { '0': 2.1, '1': 2.3, '2': 2.5 },
    ));

    const collector = new EurostatInflationCollector();
    const result = await collector.collect(ctx);

    expect(result.data?.eurozoneHicpYoY).toBeCloseTo(2.5);
  });

  it('returns partial when value object is empty', async () => {
    stubFetch(makeEurostatJson({ '2025-01': 0 }, {}));

    const collector = new EurostatInflationCollector();
    const result = await collector.collect(ctx);

    expect(result.status).toBe('partial');
    expect(result.itemCount).toBe(0);
  });

  it('returns partial when dimension is missing', async () => {
    stubFetch({ value: { '0': 2.5 } });

    const collector = new EurostatInflationCollector();
    const result = await collector.collect(ctx);

    expect(result.status).toBe('partial');
  });

  it('throws when Eurostat returns non-200', async () => {
    stubFetch({}, 502);

    const collector = new EurostatInflationCollector();
    await expect(collector.collect(ctx)).rejects.toThrow('502');
  });
});
