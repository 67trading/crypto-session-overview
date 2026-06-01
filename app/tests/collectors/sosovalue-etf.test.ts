import { describe, it, expect, vi, afterEach } from 'vitest';
import { SoSoValueEtfCollector } from '../../src/collectors/sosovalue-etf.collector.js';
import type { CollectorRunContext } from '../../../service/src/ports.js';

const ctx = {} as CollectorRunContext;

afterEach(() => { vi.restoreAllMocks(); });

function response(date: string, flow: number, status = 200): Response {
  return new Response(JSON.stringify({
    code: 0,
    data: [{ date, totalNetInflow: flow }],
  }), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('SoSoValueEtfCollector', () => {
  it('populates BTC and ETH ETF flow context when both assets succeed', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(response('2026-05-29', 125_000_000))
      .mockResolvedValueOnce(response('2026-05-29', -25_000_000)));

    const result = await new SoSoValueEtfCollector().collect(ctx);

    expect(result.status).toBe('success');
    expect(result.data?.btcFlowUsd).toBe(125_000_000);
    expect(result.data?.ethFlowUsd).toBe(-25_000_000);
    expect(result.data?.sourceAvailable).toBe(true);
    expect(result.data?.source).toBe('sosovalue');
  });

  it('returns partial when BTC succeeds and ETH fails', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(response('2026-05-29', 125_000_000))
      .mockResolvedValueOnce(new Response('Bad Gateway', { status: 502 })));

    const result = await new SoSoValueEtfCollector().collect(ctx);

    expect(result.status).toBe('partial');
    expect(result.data?.btcFlowUsd).toBe(125_000_000);
    expect(result.data?.ethFlowUsd).toBeUndefined();
    expect(result.data?.btcSourceAvailable).toBe(true);
    expect(result.data?.ethSourceAvailable).toBe(false);
  });

  it('returns skipped access-limited when both assets are blocked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 403 })));

    const result = await new SoSoValueEtfCollector().collect(ctx);

    expect(result.status).toBe('skipped');
    expect(result.reasonCode).toBe('ACCESS_LIMITED');
  });

  it('returns skipped parser error when response shape changes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 0, data: [] }), { status: 200 })));

    const result = await new SoSoValueEtfCollector().collect(ctx);

    expect(result.status).toBe('skipped');
    expect(result.reasonCode).toBe('PARSER_ERROR');
  });

  it('selects the latest row chronologically for non-ISO date strings', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 0,
        data: [
          { date: 'May 30, 2026', totalNetInflow: 10 },
          { date: 'Jun 1, 2026', totalNetInflow: 20 },
        ],
      }), { status: 200 }))
      .mockResolvedValueOnce(response('Jun 1, 2026', 30)));

    const result = await new SoSoValueEtfCollector().collect(ctx);

    expect(result.data?.btcFlowUsd).toBe(20);
  });
});
