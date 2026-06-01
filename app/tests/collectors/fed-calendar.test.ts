import { describe, it, expect, vi, afterEach } from 'vitest';
import { FedCalendarCollector } from '../../src/collectors/fed-calendar.collector.js';
import type { CollectorRunContext } from '../../../service/src/ports.js';

const ctx = {} as CollectorRunContext;

afterEach(() => { vi.restoreAllMocks(); });

function rss(title: string, pubDate: string): string {
  return `<?xml version="1.0" encoding="utf-8" ?>
<rss version="2.0">
  <channel>
    <item>
      <title>${title}</title>
      <description>${title}</description>
      <pubDate>${pubDate}</pubDate>
      <link>https://www.federalreserve.gov/${encodeURIComponent(title)}</link>
    </item>
  </channel>
</rss>`;
}

describe('FedCalendarCollector', () => {
  it('collects from the active Fed press and speeches feeds', async () => {
    const pubDate = new Date().toUTCString();
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(rss('Federal Reserve issues FOMC statement', pubDate), { status: 200 }))
      .mockResolvedValueOnce(new Response(rss('Federal Reserve Governor gives remarks', pubDate), { status: 200 })));

    const result = await new FedCalendarCollector().collect(ctx);

    expect(result.status).toBe('success');
    expect(result.data).toHaveLength(2);
    expect(result.data?.map((e) => e.eventType)).toContain('fomc');
    expect(result.data?.map((e) => e.eventType)).toContain('fed_speaker');
  });

  it('returns partial when one Fed feed fails but the other succeeds', async () => {
    const pubDate = new Date().toUTCString();
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response('Not Found', { status: 404 }))
      .mockResolvedValueOnce(new Response(rss('Federal Reserve Governor gives speech', pubDate), { status: 200 })));

    const result = await new FedCalendarCollector().collect(ctx);

    expect(result.status).toBe('partial');
    expect(result.data).toHaveLength(1);
    expect(result.error).toContain('404');
  });
});
