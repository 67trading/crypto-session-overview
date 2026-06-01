import { describe, it, expect, vi, afterEach } from 'vitest';
import { BinanceAnnouncementsCollector } from '../../src/collectors/binance-announcements.collector.js';
import type { CollectorRunContext } from '../../../service/src/ports.js';

const ctx = {} as CollectorRunContext;

afterEach(() => { vi.restoreAllMocks(); });

describe('BinanceAnnouncementsCollector', () => {
  it('reads articles from the current nested catalogs response shape', async () => {
    const releaseDate = Date.now();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: {
        catalogs: [
          {
            articles: [
              { id: 123, code: 'abc', title: 'Binance Will List TEST', releaseDate },
            ],
          },
        ],
      },
    }), { status: 200 })));

    const result = await new BinanceAnnouncementsCollector().collect(ctx);

    expect(result.status).toBe('success');
    expect(result.data).toHaveLength(1);
    expect(result.data?.[0]?.eventType).toBe('exchange_listing');
  });

  it('handles an empty or unexpected data shape without parser errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: {},
    }), { status: 200 })));

    const result = await new BinanceAnnouncementsCollector().collect(ctx);

    expect(result.status).toBe('success');
    expect(result.itemCount).toBe(0);
    expect(result.data).toEqual([]);
  });
});
