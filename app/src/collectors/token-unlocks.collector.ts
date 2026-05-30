import type { EventCollector, NormalizedEvent, CryptoSession } from '../../../service/src/ports.js';

const API_URL = 'https://api.llama.fi/emission';
const ALL_SESSIONS: CryptoSession[] = ['ASIA_CRYPTO', 'EUROPE_CRYPTO', 'US_CRYPTO'];

interface DefiLlamaUnlockEvent {
  timestamp: number;
  noOfTokens: number[];
  description?: string;
}

interface DefiLlamaEmission {
  name: string;
  symbol: string;
  nextEvent?: DefiLlamaUnlockEvent;
  upcomingEvent?: DefiLlamaUnlockEvent[];
  token?: {
    price?: number;
  };
}

function importanceForUsd(usdValue: number): 'critical' | 'high' | 'medium' | 'low' {
  if (usdValue > 10_000_000) return 'critical';
  if (usdValue > 1_000_000) return 'high';
  if (usdValue > 100_000) return 'medium';
  return 'low';
}

function relevanceScoreForImportance(importance: 'critical' | 'high' | 'medium' | 'low'): number {
  switch (importance) {
    case 'critical': return 0.9;
    case 'high': return 0.75;
    case 'medium': return 0.55;
    case 'low': return 0.3;
  }
}

export class TokenUnlocksCollector implements EventCollector {
  readonly sourceName = 'token-unlocks';

  constructor(private readonly lookaheadDays: number = 3) {}

  async collect(_session: CryptoSession): Promise<NormalizedEvent[]> {
    const response = await fetch(API_URL, {
      headers: { 'User-Agent': 'trader-agent/session-overview' },
    });

    if (!response.ok) {
      throw new Error(`DefiLlama emissions fetch failed: ${response.status} ${response.statusText}`);
    }

    const body: unknown = await response.json();
    const emissions = body as DefiLlamaEmission[];

    if (!Array.isArray(emissions) || emissions.length === 0) return [];

    const now = Date.now();
    const nowSec = Math.floor(now / 1000);
    const lookaheadSec = this.lookaheadDays * 24 * 60 * 60;
    const windowEnd = nowSec + lookaheadSec;
    const detectedAt = new Date(now).toISOString();

    const results: NormalizedEvent[] = [];

    for (const emission of emissions) {
      const candidates: DefiLlamaUnlockEvent[] = [];

      if (emission.nextEvent !== undefined) {
        candidates.push(emission.nextEvent);
      }
      if (emission.upcomingEvent !== undefined) {
        for (const ev of emission.upcomingEvent) {
          candidates.push(ev);
        }
      }

      for (const ev of candidates) {
        if (ev.timestamp < nowSec || ev.timestamp > windowEnd) continue;

        const tokenCount = ev.noOfTokens[0] ?? 0;
        const price = emission.token?.price ?? 0;
        const usdValue = tokenCount * price;
        if (tokenCount === 0) continue;
        if (price > 0 && usdValue < 10_000_000) continue;
        const importance = importanceForUsd(usdValue);
        const relevanceScore = relevanceScoreForImportance(importance);
        const dedupeKey = `defillama-unlock-${emission.symbol}-${ev.timestamp}`;

        results.push({
          eventId: dedupeKey,
          eventType: 'token_unlock',
          category: 'onchain',
          asset: emission.symbol,
          title: `${emission.name} (${emission.symbol}) Token Unlock`,
          scheduledTime: new Date(ev.timestamp * 1000).toISOString(),
          detectedAt,
          importance,
          sessionRelevance: ALL_SESSIONS,
          source: 'defillama-unlocks',
          summary:
            ev.description ??
            `Token unlock for ${emission.name} (${emission.symbol})${usdValue > 0 ? ` — estimated $${(usdValue / 1_000_000).toFixed(2)}M` : ''}`,
          confidence: 'medium',
          dedupeKey,
          relevanceScore,
        });
      }
    }

    return results;
  }
}
