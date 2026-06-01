import type { EventCollector, NormalizedEvent, CryptoSession, CollectorRunContext, CollectorResult } from '../../../service/src/ports.js';

const MULTI_METADATA_URL = 'https://api.mobula.io/api/1/multi-metadata';
const UA = 'trader-agent/session-overview';
const LOOKAHEAD_72H = 72 * 60 * 60;
const ALL_SESSIONS: CryptoSession[] = ['ASIA_CRYPTO', 'EUROPE_CRYPTO', 'US_CRYPTO'];

type MobulaMetadata = {
  name?: string;
  symbol?: string;
  price?: number;
  market_cap?: number;
  circulating_supply?: number;
  rank?: number;
  release_schedule?: unknown;
};

type UnlockCandidate = {
  name: string;
  symbol: string;
  timestampSec: number;
  tokenCount: number;
  price: number;
  circulatingSupply: number;
  rank: number;
  description?: string;
};

function normalizeSymbol(symbol: string): string {
  return symbol.replace(/USDT$/i, '').toUpperCase();
}

function toAssetQuery(symbols: string[]): string {
  return [...new Set(symbols.map(normalizeSymbol))].join(',');
}

function num(value: unknown): number {
  if (Array.isArray(value)) return num(value[0]);
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function timestampSeconds(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
  if (typeof value === 'string') {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) return timestampSeconds(asNumber);
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return Math.floor(parsed / 1000);
  }
  return 0;
}

function dataArray(body: unknown): MobulaMetadata[] {
  const data = (body as { data?: unknown }).data;
  if (Array.isArray(data)) return data as MobulaMetadata[];
  if (data !== null && typeof data === 'object') return Object.values(data) as MobulaMetadata[];
  return [];
}

function extractScheduleItems(metadata: MobulaMetadata): unknown[] {
  if (Array.isArray(metadata.release_schedule)) return metadata.release_schedule;
  return [];
}

function extractCandidate(metadata: MobulaMetadata, item: unknown): UnlockCandidate | undefined {
  if (item === null || typeof item !== 'object') return undefined;
  const raw = item as Record<string, unknown>;
  const symbol = normalizeSymbol(metadata.symbol ?? String(raw['symbol'] ?? ''));
  if (symbol === '') return undefined;
  const name = metadata.name ?? String(raw['name'] ?? symbol);
  const timestampSec = timestampSeconds(raw['date'] ?? raw['unlock_date'] ?? raw['timestamp'] ?? raw['time']);
  const tokenCount = num(raw['tokens'] ?? raw['amount'] ?? raw['amount_unlocked'] ?? raw['unlock_amount'] ?? raw['noOfTokens']);
  if (timestampSec <= 0 || tokenCount <= 0) return undefined;

  return {
    name,
    symbol,
    timestampSec,
    tokenCount,
    price: num(metadata.price ?? raw['price']),
    circulatingSupply: num(metadata.circulating_supply ?? raw['circulating_supply']),
    rank: num(metadata.rank ?? raw['rank']) || Infinity,
    ...(typeof raw['description'] === 'string' ? { description: raw['description'] } : {}),
  };
}

function passesFilter(candidate: UnlockCandidate, focusSymbols: Set<string>): boolean {
  const valueUsd = candidate.tokenCount * candidate.price;
  if (valueUsd > 10_000_000) return true;
  if (candidate.circulatingSupply > 0 && candidate.tokenCount > candidate.circulatingSupply * 0.01) return true;
  if (focusSymbols.has(candidate.symbol)) return true;
  if (candidate.rank <= 200) return true;
  if (candidate.circulatingSupply > 0 && candidate.tokenCount > candidate.circulatingSupply * 0.05) return true;
  return false;
}

function importance(usdValue: number): 'critical' | 'high' | 'medium' | 'low' {
  if (usdValue > 50_000_000) return 'critical';
  if (usdValue > 10_000_000) return 'high';
  if (usdValue > 1_000_000) return 'medium';
  return 'low';
}

function relevanceScore(imp: 'critical' | 'high' | 'medium' | 'low'): number {
  if (imp === 'critical') return 0.9;
  if (imp === 'high') return 0.75;
  if (imp === 'medium') return 0.55;
  return 0.35;
}

export class MobulaUnlocksCollector implements EventCollector {
  readonly sourceName = 'mobula-unlocks';

  constructor(
    private readonly apiKey: string | undefined,
    private readonly focusSymbols: string[] = [],
  ) {}

  async collect(ctx: CollectorRunContext): Promise<CollectorResult<NormalizedEvent[]>> {
    if (this.apiKey === undefined || this.apiKey.trim() === '') {
      return {
        status: 'skipped',
        data: [],
        itemCount: 0,
        reasonCode: 'MISSING_API_KEY',
        error: 'MOBULA_API_KEY is required for primary token unlock coverage',
      };
    }

    const core = ctx.symbols?.core ?? [];
    const major = ctx.symbols?.major ?? [];
    const watch = ctx.symbols?.watch ?? [];
    const assets = toAssetQuery([...core, ...major, ...watch, ...this.focusSymbols]);
    const response = await fetch(`${MULTI_METADATA_URL}?assets=${encodeURIComponent(assets)}`, {
      headers: { 'User-Agent': UA, Authorization: this.apiKey },
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 402 || response.status === 403) {
        return { status: 'skipped', data: [], itemCount: 0, reasonCode: 'ACCESS_LIMITED', error: `Mobula unlock metadata access limited: ${response.status} ${response.statusText}` };
      }
      if (response.status === 429) {
        return { status: 'skipped', data: [], itemCount: 0, reasonCode: 'ACCESS_LIMITED_QUOTA', error: `Mobula unlock metadata quota/rate limited: ${response.status} ${response.statusText}` };
      }
      throw new Error(`Mobula unlock metadata fetch failed: ${response.status} ${response.statusText}`);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (err) {
      return { status: 'skipped', data: [], itemCount: 0, reasonCode: 'PARSER_ERROR', error: `Mobula unlock metadata JSON parse failed: ${String(err)}` };
    }

    const metadataItems = dataArray(body);
    if (metadataItems.length === 0) {
      return { status: 'skipped', data: [], itemCount: 0, reasonCode: 'PARSER_ERROR', error: 'Mobula unlock metadata response has no data array/object' };
    }

    const now = Math.floor(Date.now() / 1000);
    const windowEnd = now + LOOKAHEAD_72H;
    const detectedAt = new Date().toISOString();
    const focusSet = new Set([...core, ...major, ...this.focusSymbols].map(normalizeSymbol));
    const events: NormalizedEvent[] = [];

    for (const metadata of metadataItems) {
      for (const item of extractScheduleItems(metadata)) {
        const candidate = extractCandidate(metadata, item);
        if (candidate === undefined) continue;
        if (candidate.timestampSec < now || candidate.timestampSec > windowEnd) continue;
        if (!passesFilter(candidate, focusSet)) continue;

        const usdValue = candidate.tokenCount * candidate.price;
        const imp = importance(usdValue);
        const dedupeKey = `mobula-unlock-${candidate.symbol}-${candidate.timestampSec}`;
        events.push({
          eventId: dedupeKey,
          eventType: 'token_unlock',
          category: 'crypto',
          asset: candidate.symbol,
          title: `${candidate.name} (${candidate.symbol}) Token Unlock`,
          scheduledTime: new Date(candidate.timestampSec * 1000).toISOString(),
          detectedAt,
          importance: imp,
          sessionRelevance: ALL_SESSIONS,
          source: 'mobula-unlocks',
          summary: candidate.description ?? `${candidate.name} unlock${usdValue > 0 ? ` - est. $${(usdValue / 1_000_000).toFixed(1)}M` : ''}`,
          confidence: 'high',
          dedupeKey,
          relevanceScore: relevanceScore(imp),
        });
      }
    }

    return { status: 'success', data: events, itemCount: events.length, source: 'mobula-unlocks' };
  }
}
