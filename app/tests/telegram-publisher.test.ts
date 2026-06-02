import { afterEach, describe, expect, it, vi } from 'vitest';
import { TelegramPublisher } from '../src/telegram-publisher.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TelegramPublisher', () => {
  it('sends briefs with Telegram HTML parse mode and web previews disabled', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ ok: true, result: { message_id: 123 } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const publisher = new TelegramPublisher('token', '-100123');

    const ids = await publisher.publish('BTC_USDT * context', 'EUROPE_CRYPTO');

    expect(ids).toEqual(['123']);
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body)).toEqual({
      chat_id: '-100123',
      text: 'BTC_USDT * context',
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  });
});
