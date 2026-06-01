import { XMLParser } from 'fast-xml-parser';
import type { EventCollector, NormalizedEvent, NormalizedEventType, CollectorRunContext, CollectorResult } from '../../../service/src/ports.js';

const RSS_URLS = [
  'https://www.federalreserve.gov/feeds/press_all.xml',
  'https://www.federalreserve.gov/feeds/speeches.xml',
] as const;

const NOW_MS = () => Date.now();
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

interface RssItem {
  title?: string;
  description?: string;
  pubDate?: string;
  link?: string;
  guid?: string | { '#text': string };
}

function classifyTitle(title: string): {
  eventType: NormalizedEventType;
  importance: 'critical' | 'high' | 'medium' | 'low';
  relevanceScore: number;
} {
  const t = title.toLowerCase();

  if (t.includes('fomc') || t.includes('federal open market committee')) {
    return { eventType: 'fomc', importance: 'critical', relevanceScore: 0.95 };
  }

  if (
    t.includes('federal reserve') &&
    (t.includes('speech') || t.includes('remarks') || t.includes('statement'))
  ) {
    return { eventType: 'fed_speaker', importance: 'high', relevanceScore: 0.75 };
  }

  return { eventType: 'macro_other', importance: 'medium', relevanceScore: 0.5 };
}

function isWithinWindow(pubDateStr: string | undefined): boolean {
  if (!pubDateStr) return false;
  const ts = Date.parse(pubDateStr);
  if (isNaN(ts)) return false;
  const now = NOW_MS();
  return ts >= now - SEVEN_DAYS_MS && ts <= now + FOURTEEN_DAYS_MS;
}

function resolveGuid(guid: string | { '#text': string } | undefined): string | undefined {
  if (guid === undefined) return undefined;
  if (typeof guid === 'string') return guid;
  return guid['#text'];
}

export class FedCalendarCollector implements EventCollector {
  readonly sourceName = 'fed-calendar';

  async collect(_ctx: CollectorRunContext): Promise<CollectorResult<NormalizedEvent[]>> {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
    const fetches = await Promise.allSettled(RSS_URLS.map(async (url) => {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'trader-agent/session-overview' },
      });

      if (!response.ok) {
        throw new Error(`${url}: ${response.status} ${response.statusText}`);
      }

      const xml = await response.text();
      const parsed: unknown = parser.parse(xml);
      const rss = parsed as {
        rss?: { channel?: { item?: RssItem | RssItem[] } };
      };
      const rawItems = rss.rss?.channel?.item;
      if (rawItems === undefined) return [];
      return Array.isArray(rawItems) ? rawItems : [rawItems];
    }));

    const items: RssItem[] = [];
    const errors: string[] = [];
    for (const result of fetches) {
      if (result.status === 'fulfilled') {
        items.push(...result.value);
      } else {
        errors.push(String(result.reason));
      }
    }

    if (items.length === 0 && errors.length > 0) {
      return { status: 'failed', data: [], itemCount: 0, error: `Fed RSS fetch failed: ${errors.join('; ')}` };
    }

    const now = NOW_MS();
    const detectedAt = new Date(now).toISOString();
    const seen = new Set<string>();

    const events = items
      .filter((item) => isWithinWindow(item.pubDate))
      .map((item): NormalizedEvent => {
        const title = item.title ?? '';
        const link = item.link ?? '';
        const guidStr = resolveGuid(item.guid);
        const { eventType, importance, relevanceScore } = classifyTitle(title);
        const dedupeKey = `fed-${link !== '' ? link : (guidStr ?? title)}`;

        return {
          eventId: dedupeKey,
          eventType,
          category: 'macro',
          title,
          ...(item.pubDate !== undefined ? { scheduledTime: new Date(item.pubDate).toISOString() } : {}),
          detectedAt,
          importance,
          sessionRelevance: ['US_CRYPTO'],
          source: 'fed-rss',
          summary: item.description ?? title,
          confidence: 'high',
          dedupeKey,
          relevanceScore,
        };
      })
      .filter((event) => {
        if (seen.has(event.dedupeKey)) return false;
        seen.add(event.dedupeKey);
        return true;
      });
    return {
      status: errors.length > 0 ? 'partial' : 'success',
      data: events,
      itemCount: events.length,
      ...(errors.length > 0 ? { error: `Fed RSS fetch partially failed: ${errors.join('; ')}` } : {}),
    };
  }
}
