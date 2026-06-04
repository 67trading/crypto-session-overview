import { describe, expect, it, vi } from 'vitest';
import { BybitHttpClient } from '../src/bybit-http-client.js';

describe('BybitHttpClient', () => {
  it('requests open interest with Bybit v5 daily interval syntax', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      retCode: 0,
      retMsg: 'OK',
      result: {
        list: [
          { openInterest: '58590.28400000', timestamp: '1780531200000' },
          { openInterest: '58488.68200000', timestamp: '1780444800000' },
        ],
      },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new BybitHttpClient('https://api.bybit.com');
    const rows = await client.getOpenInterest('BTCUSDT', '1d');

    const calledUrl = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(calledUrl.pathname).toBe('/v5/market/open-interest');
    expect(calledUrl.searchParams.get('category')).toBe('linear');
    expect(calledUrl.searchParams.get('symbol')).toBe('BTCUSDT');
    expect(calledUrl.searchParams.get('intervalTime')).toBe('1d');
    expect(rows).toEqual([
      { openInterest: 58590.284, timestamp: 1780531200000 },
      { openInterest: 58488.682, timestamp: 1780444800000 },
    ]);
  });
});
