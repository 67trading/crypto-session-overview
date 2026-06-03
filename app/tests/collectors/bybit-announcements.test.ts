import { describe, it, expect, vi } from 'vitest';
import type { CollectorRunContext } from '../../../service/src/ports.js';
import { BybitAnnouncementsCollector } from '../../src/collectors/bybit-announcements.js';

const ctx = {} as CollectorRunContext;

describe('BybitAnnouncementsCollector', () => {
  it('propagates error when getAnnouncements throws — does not silently return []', async () => {
    const client = {
      getAnnouncements: vi.fn().mockRejectedValue(new Error('network timeout')),
    };
    const collector = new BybitAnnouncementsCollector(client as never);
    await expect(collector.collect(ctx)).rejects.toThrow('network timeout');
  });

  it('propagates non-Error rejection', async () => {
    const client = {
      getAnnouncements: vi.fn().mockRejectedValue('ECONNREFUSED'),
    };
    const collector = new BybitAnnouncementsCollector(client as never);
    await expect(collector.collect(ctx)).rejects.toBeDefined();
  });

  it('returns mapped events on success', async () => {
    const client = {
      getAnnouncements: vi.fn().mockResolvedValue([
        {
          id: '123',
          title: 'New listing: XYZUSDT',
          publishTime: Date.now(),
          tags: ['listing'],
          url: 'https://bybit.com/123',
        },
      ]),
    };
    const collector = new BybitAnnouncementsCollector(client as never);
    const result = await collector.collect(ctx);
    expect(result.data).toHaveLength(1);
    expect(result.data?.[0]?.eventType).toBe('exchange_listing');
    expect(result.status).toBe('success');
    expect(result.itemCount).toBe(1);
  });

  it('extracts delisting trading-end time from Bybit announcement wording', async () => {
    const client = {
      getAnnouncements: vi.fn().mockResolvedValue([
        {
          id: '456',
          title: 'Delisting of ELON and VINU',
          description: 'Trading of ELONUSDT and VINUUSDT will no longer be supported after June 10, 2026, 8AM UTC.',
          publishTime: Date.UTC(2026, 5, 3, 8, 0, 1),
          tags: ['delisting'],
          url: 'https://bybit.com/456',
        },
      ]),
    };
    const collector = new BybitAnnouncementsCollector(client as never);
    const result = await collector.collect(ctx);

    expect(result.data?.[0]?.eventType).toBe('exchange_delisting');
    expect(result.data?.[0]?.publishedAt).toBe('2026-06-03T08:00:01.000Z');
    expect(result.data?.[0]?.tradingEndsAt).toBe('2026-06-10T08:00:00.000Z');
    expect(result.data?.[0]?.scheduledTime).toBe('2026-06-10T08:00:00.000Z');
  });
});
