import { XMLParser } from 'fast-xml-parser';
import type { EventCollector, NormalizedEvent, NormalizedEventType, CollectorRunContext, CollectorResult } from '../../../service/src/ports.js';

const ATOM_URL =
  'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=19b-4&dateb=&owner=include&count=20&search_text=&output=atom';

const CRYPTO_KEYWORDS = [
  'bitcoin',
  'ethereum',
  'crypto',
  'digital asset',
  'spot etf',
  'btc',
  'eth',
];

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

interface AtomEntry {
  title?: string;
  updated?: string;
  summary?: string;
  id?: string;
  link?: { '@_href'?: string } | string;
}

function containsCryptoKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return CRYPTO_KEYWORDS.some((kw) => lower.includes(kw));
}

function classifyEntry(title: string): {
  eventType: NormalizedEventType;
  importance: 'critical' | 'high' | 'medium' | 'low';
  relevanceScore: number;
} {
  if (title.toLowerCase().includes('etf')) {
    return { eventType: 'etf_related', importance: 'high', relevanceScore: 0.85 };
  }
  return { eventType: 'macro_other', importance: 'medium', relevanceScore: 0.5 };
}

function isWithinWindow(updatedStr: string | undefined): boolean {
  if (!updatedStr) return false;
  const ts = Date.parse(updatedStr);
  if (isNaN(ts)) return false;
  const now = Date.now();
  return ts >= now - FOURTEEN_DAYS_MS && ts <= now + FOURTEEN_DAYS_MS;
}

function resolveLink(link: AtomEntry['link']): string {
  if (link === undefined) return '';
  if (typeof link === 'string') return link;
  return link['@_href'] ?? '';
}

export class SecRssCollector implements EventCollector {
  readonly sourceName = 'sec-rss';

  async collect(_ctx: CollectorRunContext): Promise<CollectorResult<NormalizedEvent[]>> {
    const response = await fetch(ATOM_URL, {
      headers: { 'User-Agent': 'trader-agent/session-overview' },
    });

    if (!response.ok) {
      throw new Error(`SEC Atom fetch failed: ${response.status} ${response.statusText}`);
    }

    const xml = await response.text();
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
    const parsed: unknown = parser.parse(xml);

    const feed = parsed as {
      feed?: { entry?: AtomEntry | AtomEntry[] };
    };

    const rawEntries = feed.feed?.entry;
    if (rawEntries === undefined) return { status: 'success', data: [], itemCount: 0 };

    const entries: AtomEntry[] = Array.isArray(rawEntries) ? rawEntries : [rawEntries];

    const now = Date.now();
    const detectedAt = new Date(now).toISOString();

    const events = entries
      .filter((entry) => {
        if (!isWithinWindow(entry.updated)) return false;
        const combined = `${entry.title ?? ''} ${entry.summary ?? ''}`;
        return containsCryptoKeyword(combined);
      })
      .map((entry): NormalizedEvent => {
        const title = entry.title ?? '';
        const link = resolveLink(entry.link);
        const id = entry.id ?? link;
        const { eventType, importance, relevanceScore } = classifyEntry(title);
        const dedupeKey = `sec-${id !== '' ? id : title}`;

        return {
          eventId: dedupeKey,
          eventType,
          category: 'exchange',
          title,
          ...(entry.updated !== undefined ? { scheduledTime: new Date(entry.updated).toISOString() } : {}),
          detectedAt,
          importance,
          sessionRelevance: ['US_CRYPTO'],
          source: 'sec-rss',
          summary: entry.summary ?? title,
          confidence: 'medium',
          dedupeKey,
          relevanceScore,
        };
      });
    return { status: 'success', data: events, itemCount: events.length };
  }
}
