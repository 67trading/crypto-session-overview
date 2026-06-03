import type { CryptoSession } from '../session/session.types.js';

export type NormalizedEventType =
  | 'exchange_listing' | 'exchange_delisting' | 'exchange_maintenance'
  | 'token_unlock' | 'protocol_upgrade' | 'airdrop' | 'governance_vote'
  | 'security_incident' | 'stablecoin_event' | 'etf_related'
  | 'fomc' | 'cpi' | 'ppi' | 'pce' | 'nfp' | 'fed_speaker' | 'macro_other';

export type EventCategory = 'crypto' | 'macro' | 'exchange' | 'security';
export type EventImportance = 'critical' | 'high' | 'medium' | 'low';

export type NormalizedEvent = {
  eventId: string;
  eventType: NormalizedEventType;
  category: EventCategory;
  asset?: string;
  exchange?: string;
  title: string;
  scheduledTime?: string;
  detectedAt: string;
  publishedAt?: string;
  effectiveAt?: string;
  tradingEndsAt?: string;
  importance: EventImportance;
  sessionRelevance: CryptoSession[];
  source: string;
  summary: string;
  confidence: 'low' | 'medium' | 'high';
  dedupeKey: string;
  relevanceScore: number;
};
