import type { EventCollector, NormalizedEvent, CryptoSession, NormalizedEventType, CollectorRunContext, CollectorResult } from '../../../service/src/ports.js';
import type { BybitHttpClient, BybitAnnouncement } from '../bybit-http-client.js';

const ALL_SESSIONS: CryptoSession[] = ['ASIA_CRYPTO', 'EUROPE_CRYPTO', 'US_CRYPTO'];
const MONTHS: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

function classifyAnnouncement(announcement: BybitAnnouncement): {
  eventType: NormalizedEventType;
  relevanceScore: number;
} {
  const tags = announcement.tags.map((t) => t.toLowerCase());
  const title = announcement.title.toLowerCase();

  const isListing =
    tags.some((t) => t.includes('listing') || t.includes('new token') || t.includes('new listing')) ||
    title.includes('list') ||
    title.includes('delist');

  const isMaintenance =
    tags.some((t) => t.includes('maintenance') || t.includes('system')) ||
    title.includes('maintenance') ||
    title.includes('system update');

  if (isListing) {
    const isDelisting = title.includes('delist');
    return {
      eventType: isDelisting ? 'exchange_delisting' : 'exchange_listing',
      relevanceScore: 0.7,
    };
  }

  if (isMaintenance) {
    return {
      eventType: 'exchange_maintenance',
      relevanceScore: 0.4,
    };
  }

  // Default: treat as exchange listing with lower relevance
  return {
    eventType: 'exchange_listing',
    relevanceScore: 0.4,
  };
}

export class BybitAnnouncementsCollector implements EventCollector {
  readonly sourceName = 'bybit-announcements';

  constructor(private readonly client: BybitHttpClient) {}

  async collect(_ctx: CollectorRunContext): Promise<CollectorResult<NormalizedEvent[]>> {
    const announcements = await this.client.getAnnouncements(20);
    const events = announcements.map((a) => this.mapToEvent(a));
    return { status: 'success', data: events, itemCount: events.length };
  }

  private mapToEvent(announcement: BybitAnnouncement): NormalizedEvent {
    const { eventType, relevanceScore } = classifyAnnouncement(announcement);
    const detectedAt = new Date(announcement.publishTime).toISOString();
    const tradingEndsAt = eventType === 'exchange_delisting'
      ? extractTradingEndsAt(`${announcement.title}\n${announcement.description}`)
      : undefined;

    return {
      eventId: `bybit-${announcement.id}`,
      eventType,
      category: 'exchange',
      exchange: 'Bybit',
      title: announcement.title,
      detectedAt,
      publishedAt: detectedAt,
      ...(tradingEndsAt !== undefined ? { tradingEndsAt, scheduledTime: tradingEndsAt } : {}),
      importance: relevanceScore >= 0.7 ? 'high' : 'medium',
      sessionRelevance: ALL_SESSIONS,
      source: this.sourceName,
      summary: announcement.description || announcement.title,
      confidence: 'medium',
      dedupeKey: `bybit-${announcement.id}`,
      relevanceScore,
    };
  }
}

function extractTradingEndsAt(text: string): string | undefined {
  const normalized = text.replace(/\s+/g, ' ');
  const tradingEndPatterns = [
    /\btrading\s+(?:of\s+.+?\s+)?will\s+no\s+longer\s+be\s+supported\s+after\s+([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})[, ]+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?\s*(?:UTC)?/i,
    /\btrading\s+(?:will\s+)?(?:end|cease|close)\s+(?:on\s+)?([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})[, ]+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?\s*(?:UTC)?/i,
    /\bwill\s+be\s+delisted\s+on\s+([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})[, ]+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?\s*(?:UTC)?/i,
  ];
  const match = tradingEndPatterns
    .map((pattern) => pattern.exec(normalized))
    .find((candidate): candidate is RegExpExecArray => candidate !== null);
  if (match === undefined) return undefined;

  const month = MONTHS[match[1]!.toLowerCase()];
  const day = Number(match[2]);
  const year = Number(match[3]);
  const hour = Number(match[4]);
  const minute = match[5] !== undefined ? Number(match[5]) : 0;
  const meridiem = match[6]?.toUpperCase();
  if (month === undefined || !Number.isFinite(day) || !Number.isFinite(year) || !Number.isFinite(hour) || !Number.isFinite(minute)) return undefined;

  const normalizedHour = meridiem === 'PM' && hour < 12 ? hour + 12 : meridiem === 'AM' && hour === 12 ? 0 : hour;
  const date = new Date(Date.UTC(year, month, day, normalizedHour, minute));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
