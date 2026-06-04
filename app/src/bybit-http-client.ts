// Local types for Bybit API responses

type BybitApiResponse<T> = {
  retCode: number;
  retMsg: string;
  result: T;
};

export type BybitKline = {
  openTimeMs: number;
  closeTimeMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type BybitFundingRate = {
  symbol: string;
  fundingRate: number;
  fundingRateTimestamp: number;
};

export type BybitOpenInterest = {
  openInterest: number;
  timestamp: number;
};

export type BybitAnnouncement = {
  id: number;
  title: string;
  description: string;
  url: string;
  publishTime: number;
  tags: string[];
};

async function parseJson<T>(res: Response, label: string): Promise<T> {
  if (!res.ok) {
    throw new Error(`Bybit ${label} HTTP ${res.status}: ${res.statusText}`);
  }
  const data = (await res.json()) as BybitApiResponse<T>;
  if (data.retCode !== 0) {
    throw new Error(`Bybit ${label} API error ${data.retCode}: ${data.retMsg}`);
  }
  return data.result;
}

export class BybitHttpClient {
  constructor(private readonly baseUrl: string) {}

  async getKlines(
    symbol: string,
    interval: 'W' | 'D' | '240',
    limit: number,
    category: 'spot' | 'linear' = 'spot',
  ): Promise<BybitKline[]> {
    const url = new URL(`${this.baseUrl}/v5/market/kline`);
    url.searchParams.set('category', category);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('interval', interval);
    url.searchParams.set('limit', String(limit));

    const result = await parseJson<{ list: string[][] }>(
      await fetch(url.toString()),
      `kline(${symbol},${interval})`,
    );

    // Bybit returns newest first — reverse for chronological order
    const intervalMs =
      interval === 'W' ? 7 * 24 * 60 * 60 * 1000
      : interval === 'D' ? 24 * 60 * 60 * 1000
      : 4 * 60 * 60 * 1000;

    return result.list.reverse().map((item) => {
      // Bybit kline list: [startTime, open, high, low, close, volume, turnover]
      const openTimeMs = Number(item[0] ?? '0');
      return {
        openTimeMs,
        closeTimeMs: openTimeMs + intervalMs - 1,
        open: parseFloat(item[1] ?? '0'),
        high: parseFloat(item[2] ?? '0'),
        low: parseFloat(item[3] ?? '0'),
        close: parseFloat(item[4] ?? '0'),
        volume: parseFloat(item[5] ?? '0'),
      };
    });
  }

  async getFundingRateHistory(symbol: string, limit: number): Promise<BybitFundingRate[]> {
    const url = new URL(`${this.baseUrl}/v5/market/funding/history`);
    url.searchParams.set('category', 'linear');
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('limit', String(limit));

    const result = await parseJson<{ list: Array<{ symbol: string; fundingRate: string; fundingRateTimestamp: string }> }>(
      await fetch(url.toString()),
      `fundingRate(${symbol})`,
    );

    return result.list.map((item) => ({
      symbol: item.symbol,
      fundingRate: parseFloat(item.fundingRate),
      fundingRateTimestamp: Number(item.fundingRateTimestamp),
    }));
  }

  async getOpenInterest(symbol: string, intervalTime: '1d'): Promise<BybitOpenInterest[]> {
    const url = new URL(`${this.baseUrl}/v5/market/open-interest`);
    url.searchParams.set('category', 'linear');
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('intervalTime', intervalTime);
    url.searchParams.set('limit', '10');

    const result = await parseJson<{ list: Array<{ openInterest: string; timestamp: string }> }>(
      await fetch(url.toString()),
      `openInterest(${symbol})`,
    );

    return result.list.map((item) => ({
      openInterest: parseFloat(item.openInterest),
      timestamp: Number(item.timestamp),
    }));
  }

  async getAnnouncements(limit: number): Promise<BybitAnnouncement[]> {
    const url = new URL(`${this.baseUrl}/v5/announcements/index`);
    url.searchParams.set('locale', 'en-US');
    url.searchParams.set('limit', String(limit));

    const result = await parseJson<{ list: Array<{ id: number; title: string; description: string; url: string; publishTime: number; tags: string[] }> }>(
      await fetch(url.toString()),
      'announcements',
    );

    return result.list.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description ?? '',
      url: item.url ?? '',
      publishTime: item.publishTime,
      tags: Array.isArray(item.tags) ? item.tags : [],
    }));
  }

  async getTicker(
    symbol: string,
    category: 'spot' | 'linear' = 'spot',
  ): Promise<{ lastPrice: number; prevPrice24h?: number; highPrice24h?: number; lowPrice24h?: number; price24hPcnt?: number }> {
    const url = new URL(`${this.baseUrl}/v5/market/tickers`);
    url.searchParams.set('category', category);
    url.searchParams.set('symbol', symbol);

    const result = await parseJson<{ list: Array<{ lastPrice: string; prevPrice24h?: string; highPrice24h?: string; lowPrice24h?: string; price24hPcnt?: string }> }>(
      await fetch(url.toString()),
      `ticker(${symbol})`,
    );

    const first = result.list[0];
    if (first === undefined) {
      throw new Error(`No ticker data returned for symbol: ${symbol}`);
    }

    return {
      lastPrice: parseFloat(first.lastPrice),
      ...(first.prevPrice24h !== undefined ? { prevPrice24h: parseFloat(first.prevPrice24h) } : {}),
      ...(first.highPrice24h !== undefined ? { highPrice24h: parseFloat(first.highPrice24h) } : {}),
      ...(first.lowPrice24h !== undefined ? { lowPrice24h: parseFloat(first.lowPrice24h) } : {}),
      ...(first.price24hPcnt !== undefined ? { price24hPcnt: parseFloat(first.price24hPcnt) * 100 } : {}),
    };
  }
}
