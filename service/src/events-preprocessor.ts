import type { NormalizedEvent, CryptoSession, PrecomputedEvents } from './ports.js';

export type { PrecomputedEvents } from './ports.js';

const IMPORTANCE_ORDER: Record<NormalizedEvent['importance'], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const DEFAULT_MAX_UPCOMING = 8;

export function preprocessEvents(
  events: NormalizedEvent[],
  session: CryptoSession,
  maxUpcoming = DEFAULT_MAX_UPCOMING,
): { filteredEvents: NormalizedEvent[]; precomputedEvents: PrecomputedEvents } {
  // 1. Deduplicate by dedupeKey — keep the entry with the highest relevanceScore
  const byDedupeKey = new Map<string, NormalizedEvent>();
  for (const event of events) {
    const existing = byDedupeKey.get(event.dedupeKey);
    if (existing === undefined || event.relevanceScore > existing.relevanceScore) {
      byDedupeKey.set(event.dedupeKey, event);
    }
  }
  const deduped = [...byDedupeKey.values()];
  const totalDeduped = events.length - deduped.length;

  // 2. Filter to events relevant to the current session
  // Empty sessionRelevance array means relevant to all sessions
  const sessionFiltered = deduped.filter(
    (e) => e.sessionRelevance.length === 0 || e.sessionRelevance.includes(session),
  );

  // 3. Sort: importance first (critical → low), then scheduledTime asc, then relevanceScore desc
  const sorted = [...sessionFiltered].sort((a, b) => {
    const impDiff = IMPORTANCE_ORDER[a.importance] - IMPORTANCE_ORDER[b.importance];
    if (impDiff !== 0) return impDiff;
    const aTime = a.scheduledTime ?? a.detectedAt;
    const bTime = b.scheduledTime ?? b.detectedAt;
    if (aTime < bTime) return -1;
    if (aTime > bTime) return 1;
    return b.relevanceScore - a.relevanceScore;
  });

  const upcoming = sorted.slice(0, maxUpcoming).map((e) => ({
    title: e.title,
    time: e.scheduledTime ?? e.detectedAt,
    importance: e.importance,
  }));

  const precomputedEvents: PrecomputedEvents = {
    upcomingEvents: upcoming,
    totalDeduped,
    sessionFiltered: sessionFiltered.length,
    hasCritical: upcoming.some((e) => e.importance === 'critical'),
  };

  return { filteredEvents: sorted, precomputedEvents };
}
