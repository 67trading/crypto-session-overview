import type { EventCollector, NormalizedEvent, CryptoSession, NormalizedEventType } from '../../../service/src/ports.js';
import type { BybitHttpClient, BybitAnnouncement } from '../bybit-http-client.js';

const ALL_SESSIONS: CryptoSession[] = ['ASIA_CRYPTO', 'EUROPE_CRYPTO', 'US_CRYPTO'];

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

  async collect(_session: CryptoSession): Promise<NormalizedEvent[]> {
    const announcements = await this.client.getAnnouncements(20);
    return announcements.map((a) => this.mapToEvent(a));
  }

  private mapToEvent(announcement: BybitAnnouncement): NormalizedEvent {
    const { eventType, relevanceScore } = classifyAnnouncement(announcement);
    const detectedAt = new Date(announcement.publishTime).toISOString();

    return {
      eventId: `bybit-${announcement.id}`,
      eventType,
      category: 'exchange',
      exchange: 'Bybit',
      title: announcement.title,
      detectedAt,
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
