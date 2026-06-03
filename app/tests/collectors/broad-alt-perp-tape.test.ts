import { afterEach, describe, expect, it, vi } from 'vitest';
import { BroadAltPerpTapeCollector } from '../../src/collectors/broad-alt-perp-tape.collector.js';
import type { CollectorRunContext } from '../../../service/src/ports.js';

const ctx = {} as CollectorRunContext;

function bybitItem(asset: string, change = '0.01', volume = '50000000') {
  return { symbol: `${asset}USDT`, lastPrice: '10', price24hPcnt: change, turnover24h: volume };
}

function binanceItem(asset: string, change = '1', volume = '50000000') {
  return { symbol: `${asset}USDT`, priceChangePercent: change, quoteVolume: volume };
}

function okxItem(asset: string, last = '10', open = '9.9', volumeBase = '5000000') {
  return { instId: `${asset}-USDT-SWAP`, last, sodUtc0: open, volCcy24h: volumeBase };
}

function response(body: unknown): Response {
  return { ok: true, json: vi.fn().mockResolvedValue(body) } as unknown as Response;
}

describe('BroadAltPerpTapeCollector', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds broad alt perp tape breadth from assets listed on at least two venues', async () => {
    const assets = Array.from({ length: 35 }, (_, index) => `ALT${index}`);
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      const href = String(url);
      if (href.includes('bybit')) {
        return response({ retCode: 0, retMsg: 'OK', result: { list: assets.map((asset) => bybitItem(asset)) } });
      }
      if (href.includes('binance')) {
        return response(assets.map((asset) => binanceItem(asset)));
      }
      return response({ code: '0', msg: '', data: [] });
    }));

    const result = await new BroadAltPerpTapeCollector().collect(ctx);

    expect(result.status).toBe('success');
    expect(result.data?.sourceScope).toBe('broad_alt_perp_tape');
    expect(result.data?.totalTracked).toBe(35);
    expect(result.data?.breadthLabel).toBe('100% of 35 liquid alt perps positive on 24h');
    expect(result.data?.canRenderBroadLabel).toBe(true);
  });

  it('returns unavailable when filters leave fewer than 30 eligible assets', async () => {
    const assets = Array.from({ length: 6 }, (_, index) => `ALT${index}`);
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      const href = String(url);
      if (href.includes('bybit')) {
        return response({ retCode: 0, retMsg: 'OK', result: { list: assets.map((asset) => bybitItem(asset)) } });
      }
      if (href.includes('binance')) {
        return response(assets.map((asset) => binanceItem(asset)));
      }
      return response({ code: '0', msg: '', data: assets.map((asset) => okxItem(asset)) });
    }));

    const result = await new BroadAltPerpTapeCollector().collect(ctx);

    expect(result.status).toBe('partial');
    expect(result.data?.rotationState).toBe('unknown');
    expect(result.data?.canRenderBroadLabel).toBe(false);
    expect(result.data?.breadthLabel).toBe('Broad alt perp tape unavailable: only 6 eligible assets after filters');
  });

  it('excludes BTC, ETH, stables, and one-venue assets', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      const href = String(url);
      if (href.includes('bybit')) {
        return response({ retCode: 0, retMsg: 'OK', result: { list: [bybitItem('BTC'), bybitItem('ETH'), bybitItem('USDC'), bybitItem('NVDA'), bybitItem('XAU'), bybitItem('SOL')] } });
      }
      if (href.includes('binance')) {
        return response([binanceItem('NVDA'), binanceItem('XAU'), binanceItem('SOL'), binanceItem('ONLYBINANCE')]);
      }
      return response({ code: '0', msg: '', data: [] });
    }));

    const result = await new BroadAltPerpTapeCollector().collect(ctx);

    expect(result.data?.totalTracked).toBe(1);
    expect(result.data?.symbols).toEqual(undefined);
    expect(result.data?.breadthLabel).toContain('only 1 eligible assets');
  });
});
