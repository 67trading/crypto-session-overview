import type { EventCollector, NormalizedEvent, CryptoSession, NormalizedEventType, CollectorRunContext, CollectorResult } from '../../../service/src/ports.js';

const API_URL =
  'https://www.binance.com/bapi/composite/v1/public/cms/article/list/query?type=1&pageNo=1&pageSize=20&catalogId=49';

const ALL_SESSIONS: CryptoSession[] = ['ASIA_CRYPTO', 'EUROPE_CRYPTO', 'US_CRYPTO'];
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

interface BinanceArticle {
  id: number;
  code: string;
  title: string;
  releaseDate: number;
}

interface BinanceResponse {
  data: {
    articles?: BinanceArticle[];
    total?: number;
    catalogs?: BinanceCatalog[];
  } | undefined;
  success: boolean;
}

interface BinanceCatalog {
  articles?: BinanceArticle[];
  catalogs?: BinanceCatalog[];
}

function collectCatalogArticles(catalogs: BinanceCatalog[] | undefined): BinanceArticle[] {
  if (catalogs === undefined) return [];

  const articles: BinanceArticle[] = [];
  for (const catalog of catalogs) {
    if (Array.isArray(catalog.articles)) articles.push(...catalog.articles);
    articles.push(...collectCatalogArticles(catalog.catalogs));
  }
  return articles;
}

function extractArticles(parsed: BinanceResponse): BinanceArticle[] {
  return [
    ...(Array.isArray(parsed.data?.articles) ? parsed.data.articles : []),
    ...collectCatalogArticles(parsed.data?.catalogs),
  ];
}

function classifyTitle(title: string): {
  eventType: NormalizedEventType;
  importance: 'critical' | 'high' | 'medium' | 'low';
  relevanceScore: number;
} {
  const t = title.toLowerCase();

  if (t.includes('delist')) {
    return { eventType: 'exchange_delisting', importance: 'high', relevanceScore: 0.85 };
  }
  if (t.includes('list')) {
    return { eventType: 'exchange_listing', importance: 'high', relevanceScore: 0.8 };
  }
  if (t.includes('maintenance') || t.includes('suspend')) {
    return { eventType: 'exchange_maintenance', importance: 'medium', relevanceScore: 0.5 };
  }
  if (t.includes('airdrop')) {
    return { eventType: 'airdrop', importance: 'medium', relevanceScore: 0.65 };
  }
  if (t.includes('network upgrade') || t.includes('hard fork')) {
    return { eventType: 'protocol_upgrade', importance: 'high', relevanceScore: 0.75 };
  }

  return { eventType: 'macro_other', importance: 'low', relevanceScore: 0.3 };
}

export class BinanceAnnouncementsCollector implements EventCollector {
  readonly sourceName = 'binance-announcements';

  async collect(_ctx: CollectorRunContext): Promise<CollectorResult<NormalizedEvent[]>> {
    const response = await fetch(API_URL, {
      headers: {
        'User-Agent': 'trader-agent/session-overview',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Binance announcements fetch failed: ${response.status} ${response.statusText}`);
    }

    let parsed: BinanceResponse;
    try {
      parsed = (await response.json()) as BinanceResponse;
    } catch (err) {
      throw new Error(`Binance announcements JSON parse failed: ${String(err)}`);
    }

    if (!parsed.success) {
      throw new Error('Binance announcements response success=false');
    }

    const now = Date.now();
    const detectedAt = new Date(now).toISOString();
    const cutoff = now - SEVEN_DAYS_MS;

    const articles = extractArticles(parsed).filter((a) => a.releaseDate >= cutoff);

    if (articles.length === 0) return { status: 'success', data: [], itemCount: 0 };

    const events = articles.map((article): NormalizedEvent => {
      const { eventType, importance, relevanceScore } = classifyTitle(article.title);
      const dedupeKey = `binance-${article.id}`;

      return {
        eventId: dedupeKey,
        eventType,
        category: 'exchange',
        exchange: 'Binance',
        title: article.title,
        scheduledTime: new Date(article.releaseDate).toISOString(),
        detectedAt,
        importance,
        sessionRelevance: ALL_SESSIONS,
        source: 'binance-announcements',
        summary: article.title,
        confidence: 'medium',
        dedupeKey,
        relevanceScore,
      };
    });
    return { status: 'success', data: events, itemCount: events.length };
  }
}
