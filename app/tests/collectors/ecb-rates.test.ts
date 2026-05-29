import { describe, it, expect, vi, afterEach } from 'vitest';
import { EcbRatesCollector } from '../../src/collectors/ecb-rates.collector.js';
import type { CollectorRunContext } from '../../../service/src/ports.js';

const ctx = {} as CollectorRunContext;

afterEach(() => { vi.restoreAllMocks(); });

function makeSdmxJson(obsValue: number): object {
  return {
    dataSets: [{
      series: {
        '0:0:0:0:0:0:0': {
          observations: { '0': [obsValue, 0] },
        },
      },
    }],
  };
}

function stubFetchSequence(responses: Array<{ body: object; status?: number }>): void {
  let call = 0;
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
    const r = responses[call++] ?? responses[responses.length - 1]!;
    return Promise.resolve(new Response(JSON.stringify(r.body), { status: r.status ?? 200 }));
  }));
}

describe('EcbRatesCollector', () => {
  it('returns ecbDepositRate and ecbMainRate on success', async () => {
    stubFetchSequence([
      { body: makeSdmxJson(4.0) }, // DFR
      { body: makeSdmxJson(4.25) }, // MRR
    ]);

    const collector = new EcbRatesCollector();
    const result = await collector.collect(ctx);

    expect(result.status).toBe('success');
    expect(result.data?.ecbDepositRate).toBeCloseTo(4.0);
    expect(result.data?.ecbMainRate).toBeCloseTo(4.25);
    expect(result.itemCount).toBe(2);
  });

  it('returns partial when SDMX response has no dataSets', async () => {
    stubFetchSequence([
      { body: {} },
      { body: {} },
    ]);

    const collector = new EcbRatesCollector();
    const result = await collector.collect(ctx);

    expect(result.status).toBe('partial');
    expect(result.itemCount).toBe(0);
  });

  it('returns partial when series has no observations', async () => {
    stubFetchSequence([
      { body: { dataSets: [{ series: { '0:0:0:0:0:0:0': { observations: {} } } }] } },
      { body: { dataSets: [{ series: { '0:0:0:0:0:0:0': { observations: {} } } }] } },
    ]);

    const collector = new EcbRatesCollector();
    const result = await collector.collect(ctx);

    expect(result.status).toBe('partial');
  });

  it('throws when ECB returns non-200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('Service Unavailable', { status: 503 }),
    ));

    const collector = new EcbRatesCollector();
    await expect(collector.collect(ctx)).rejects.toThrow('503');
  });

  it('includes dataDate in result', async () => {
    stubFetchSequence([
      { body: makeSdmxJson(3.5) },
      { body: makeSdmxJson(3.75) },
    ]);

    const collector = new EcbRatesCollector();
    const result = await collector.collect(ctx);

    expect(result.data?.dataDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
