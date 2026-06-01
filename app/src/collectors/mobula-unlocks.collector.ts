import type { EventCollector, NormalizedEvent, CryptoSession, CollectorRunContext, CollectorResult } from '../../../service/src/ports.js';

const EMISSIONS_URL = 'https://api.llama.fi/emission';
const MOBULA_BASE = 'https://api.mobula.io/api/1/market/multi-data';
const UA = 'trader-agent/session-overview';
const LOOKAHEAD_72H = 72 * 60 * 60;
const ALL_SESSIONS: CryptoSession[] = ['ASIA_CRYPTO', 'EUROPE_CRYPTO', 'US_CRYPTO'];

interface DefiLlamaUnlock { timestamp: number; noOfTokens: number[]; description?: string }
interface DefiLlamaEmission {
  name: string; symbol: string;
  nextEvent?: DefiLlamaUnlock;
  upcomingEvent?: DefiLlamaUnlock[];
}

interface MobulaAsset {
  price?: number;
  market_cap?: number;
  circulating_supply?: number;
  rank?: number;
}
interface MobulaResponse { data?: Record<string, MobulaAsset> }

function normalizeSymbol(symbol: string): string {
  return symbol.replace(/USDT$/i, '').toUpperCase();
}

function passesFilter(
  tokenCount: number,
  market: MobulaAsset | undefined,
  focusSymbols: Set<string>,
  symbol: string,
): boolean {
  const price = market?.price ?? 0;
  const supply = market?.circulating_supply ?? 0;
  const rank = market?.rank ?? Infinity;

  const valueUsd = tokenCount * price;
  if (valueUsd > 10_000_000) return true;
  if (supply > 0 && tokenCount > supply * 0.01) return true;
  if (rank <= 200) return true;
  if (focusSymbols.has(symbol.toUpperCase())) return true;
  // cliff: ≥5% of supply unlocking at once
  if (supply > 0 && tokenCount > supply * 0.05) return true;
  return false;
}

function importance(usdValue: number): 'critical' | 'high' | 'medium' | 'low' {
  if (usdValue > 50_000_000) return 'critical';
  if (usdValue > 10_000_000) return 'high';
  if (usdValue > 1_000_000) return 'medium';
  return 'low';
}

export class MobulaUnlocksCollector implements EventCollector {
  readonly sourceName = 'defillama-mobula-unlocks';

  constructor(
    private readonly apiKey: string,
    private readonly focusSymbols: string[] = [],
  ) {}

  async collect(_ctx: CollectorRunContext): Promise<CollectorResult<NormalizedEvent[]>> {
    const emissionsRes = await fetch(EMISSIONS_URL, { headers: { 'User-Agent': UA } });
    if (!emissionsRes.ok) throw new Error(`DefiLlama emissions: ${emissionsRes.status}`);

    const emissions = await emissionsRes.json() as DefiLlamaEmission[];
    if (!Array.isArray(emissions) || emissions.length === 0) return { status: 'success', data: [], itemCount: 0 };

    const now = Math.floor(Date.now() / 1000);
    const windowEnd = now + LOOKAHEAD_72H;
    const detectedAt = new Date().toISOString();

    // Gather unlock candidates within 72h
    type Candidate = { emission: DefiLlamaEmission; unlock: DefiLlamaUnlock };
    const candidates: Candidate[] = [];
    for (const e of emissions) {
      const events = [
        ...(e.nextEvent !== undefined ? [e.nextEvent] : []),
        ...(e.upcomingEvent ?? []),
      ];
      for (const ev of events) {
        if (ev.timestamp >= now && ev.timestamp <= windowEnd) {
          candidates.push({ emission: e, unlock: ev });
        }
      }
    }
    if (candidates.length === 0) return { status: 'success', data: [], itemCount: 0 };

    // Batch-fetch Mobula market data for unique symbols
    const symbols = [...new Set(candidates.map((c) => c.emission.symbol))];
    const BATCH = 50;
    const marketData: Record<string, MobulaAsset> = {};

    for (let i = 0; i < symbols.length; i += BATCH) {
      const batch = symbols.slice(i, i + BATCH).join(',');
      const url = `${MOBULA_BASE}?assets=${encodeURIComponent(batch)}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Authorization: this.apiKey },
      });
      if (!res.ok) continue; // soft fail per batch
      const json = await res.json() as MobulaResponse;
      if (json.data !== undefined) Object.assign(marketData, json.data);
    }

    const focusSet = new Set(this.focusSymbols.map(normalizeSymbol));
    const results: NormalizedEvent[] = [];

    for (const { emission, unlock } of candidates) {
      const tokenCount = unlock.noOfTokens[0] ?? 0;
      const market = marketData[emission.symbol];
      if (!passesFilter(tokenCount, market, focusSet, emission.symbol)) continue;

      const price = market?.price ?? 0;
      const usdValue = tokenCount * price;
      const imp = importance(usdValue);
      const dedupeKey = `mobula-unlock-${emission.symbol}-${unlock.timestamp}`;

      results.push({
        eventId: dedupeKey,
        eventType: 'token_unlock',
        category: 'crypto',
        asset: emission.symbol,
        title: `${emission.name} (${emission.symbol}) Token Unlock`,
        scheduledTime: new Date(unlock.timestamp * 1000).toISOString(),
        detectedAt,
        importance: imp,
        sessionRelevance: ALL_SESSIONS,
        source: 'defillama-mobula-unlocks',
        summary: unlock.description
          ?? `${emission.name} unlock${usdValue > 0 ? ` — est. $${(usdValue / 1_000_000).toFixed(1)}M` : ''}`,
        confidence: market !== undefined ? 'high' : 'medium',
        dedupeKey,
        relevanceScore: imp === 'critical' ? 0.9 : imp === 'high' ? 0.75 : imp === 'medium' ? 0.55 : 0.35,
      });
    }

    return { status: 'success', data: results, itemCount: results.length };
  }
}
