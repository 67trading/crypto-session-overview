import type { EventCollector, NormalizedEvent, CryptoSession, NormalizedEventType } from '../../../service/src/ports.js';

const API_BASE = 'https://developers.coinmarketcal.com/v1/events';
const ALL_SESSIONS: CryptoSession[] = ['ASIA_CRYPTO', 'EUROPE_CRYPTO', 'US_CRYPTO'];
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

interface CmcCalEvent {
  id: number;
  title: { en: string };
  description?: { en?: string };
  date_event: string;
  created_date: string;
  coins: Array<{ fullname: string; symbol: string }>;
  categories: Array<{ name: string }>;
  can_occur_before: boolean;
  percentage: number;
}

interface CmcResponse {
  body: CmcCalEvent[];
}

interface CacheEntry {
  data: NormalizedEvent[];
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();

function classifyCategories(categories: Array<{ name: string }>): NormalizedEventType {
  const names = categories.map((c) => c.name.toLowerCase());
  const joined = names.join(' ');

  if (joined.includes('protocol') || joined.includes('upgrade') || joined.includes('mainnet')) {
    return 'protocol_upgrade';
  }
  if (joined.includes('airdrop')) {
    return 'airdrop';
  }
  if (joined.includes('exchange') && joined.includes('listing')) {
    return 'exchange_listing';
  }
  if (joined.includes('governance') || joined.includes('vote')) {
    return 'governance_vote';
  }
  if (joined.includes('token unlock') || joined.includes('unlock')) {
    return 'token_unlock';
  }

  return 'macro_other';
}

function relevanceScoreFor(eventType: NormalizedEventType): number {
  switch (eventType) {
    case 'protocol_upgrade': return 0.75;
    case 'airdrop': return 0.6;
    case 'exchange_listing': return 0.7;
    case 'governance_vote': return 0.6;
    case 'token_unlock': return 0.8;
    default: return 0.4;
  }
}

function importanceFor(percentage: number): 'critical' | 'high' | 'medium' | 'low' {
  if (percentage >= 90) return 'critical';
  if (percentage >= 80) return 'high';
  if (percentage >= 50) return 'medium';
  return 'low';
}

function confidenceFor(percentage: number): 'high' | 'medium' | 'low' {
  if (percentage >= 80) return 'high';
  if (percentage >= 50) return 'medium';
  return 'low';
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export class CoinMarketCalCollector implements EventCollector {
  readonly sourceName = 'coinmarketcal';

  constructor(private readonly apiKey: string, private readonly coins?: string) {}

  async collect(session: CryptoSession): Promise<NormalizedEvent[]> {
    const cacheKey = session;
    const cached = cache.get(cacheKey);
    if (cached !== undefined && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.data;
    }

    const now = new Date();
    const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const params = new URLSearchParams({
      max: '50',
      dateRangeStart: formatDate(now),
      dateRangeEnd: formatDate(end),
      ...(this.coins !== undefined ? { coins: this.coins } : {}),
    });

    const response = await fetch(`${API_BASE}?${params.toString()}`, {
      headers: {
        'x-api-key': this.apiKey,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`CoinMarketCal fetch failed: ${response.status} ${response.statusText}`);
    }

    const body: unknown = await response.json();
    const cmcResponse = body as CmcResponse;

    const events = cmcResponse.body ?? [];
    const detectedAt = new Date().toISOString();

    const normalized: NormalizedEvent[] = events.map((event): NormalizedEvent => {
      const eventType = classifyCategories(event.categories);
      const importance = importanceFor(event.percentage);
      const confidence = confidenceFor(event.percentage);
      const relevanceScore = relevanceScoreFor(eventType);
      const dedupeKey = `coinmarketcal-${event.id}`;
      const asset = event.coins[0]?.symbol;

      return {
        eventId: dedupeKey,
        eventType,
        category: 'onchain',
        ...(asset !== undefined ? { asset } : {}),
        title: event.title.en,
        scheduledTime: new Date(event.date_event).toISOString(),
        detectedAt,
        importance,
        sessionRelevance: ALL_SESSIONS,
        source: 'coinmarketcal',
        summary: event.description?.en ?? event.title.en,
        confidence,
        dedupeKey,
        relevanceScore,
      };
    });

    cache.set(cacheKey, { data: normalized, fetchedAt: Date.now() });
    return normalized;
  }
}
