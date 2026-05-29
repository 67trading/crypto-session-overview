import { describe, it, expect } from 'vitest';
import { preprocessEvents } from '../src/events-preprocessor.js';
import type { NormalizedEvent, CryptoSession } from '../src/ports.js';

let _idCounter = 0;
function makeEvent(
  overrides: Partial<NormalizedEvent> & { title: string; importance: NormalizedEvent['importance'] },
): NormalizedEvent {
  const id = String(++_idCounter);
  return {
    eventId: id,
    eventType: 'fomc',
    category: 'macro',
    title: overrides.title,
    detectedAt: overrides.detectedAt ?? '2026-01-01T00:00:00Z',
    importance: overrides.importance,
    sessionRelevance: overrides.sessionRelevance ?? ['US_CRYPTO'],
    source: 'test',
    summary: 'test event',
    confidence: 'high',
    dedupeKey: overrides.dedupeKey ?? `key-${id}`,
    relevanceScore: overrides.relevanceScore ?? 50,
    scheduledTime: overrides.scheduledTime,
    asset: overrides.asset,
    exchange: overrides.exchange,
  };
}

const SESSION: CryptoSession = 'US_CRYPTO';

describe('preprocessEvents()', () => {
  describe('deduplication', () => {
    it('deduplicates by dedupeKey, keeping highest relevanceScore', () => {
      const events = [
        makeEvent({ title: 'CPI Release', importance: 'critical', dedupeKey: 'cpi-2026-01', relevanceScore: 70 }),
        makeEvent({ title: 'CPI Release', importance: 'critical', dedupeKey: 'cpi-2026-01', relevanceScore: 90 }),
        makeEvent({ title: 'CPI Release', importance: 'critical', dedupeKey: 'cpi-2026-01', relevanceScore: 60 }),
      ];
      const { precomputedEvents } = preprocessEvents(events, SESSION);
      expect(precomputedEvents.upcomingEvents).toHaveLength(1);
      expect(precomputedEvents.totalDeduped).toBe(2);
    });

    it('keeps different dedupeKeys as separate events', () => {
      const events = [
        makeEvent({ title: 'CPI Release', importance: 'critical', dedupeKey: 'cpi-01' }),
        makeEvent({ title: 'NFP Report', importance: 'high', dedupeKey: 'nfp-01' }),
      ];
      const { precomputedEvents } = preprocessEvents(events, SESSION);
      expect(precomputedEvents.upcomingEvents).toHaveLength(2);
      expect(precomputedEvents.totalDeduped).toBe(0);
    });
  });

  describe('session filtering', () => {
    it('includes events relevant to the current session', () => {
      const events = [
        makeEvent({ title: 'US Event', importance: 'high', sessionRelevance: ['US_CRYPTO'] }),
      ];
      const { precomputedEvents } = preprocessEvents(events, 'US_CRYPTO');
      expect(precomputedEvents.upcomingEvents).toHaveLength(1);
    });

    it('excludes events not relevant to the current session', () => {
      const events = [
        makeEvent({ title: 'Asia Event', importance: 'high', sessionRelevance: ['ASIA_CRYPTO'] }),
      ];
      const { precomputedEvents } = preprocessEvents(events, 'US_CRYPTO');
      expect(precomputedEvents.upcomingEvents).toHaveLength(0);
    });

    it('includes events with empty sessionRelevance (treat as all sessions)', () => {
      const events = [
        makeEvent({ title: 'Global Event', importance: 'high', sessionRelevance: [] }),
      ];
      const { precomputedEvents } = preprocessEvents(events, 'US_CRYPTO');
      expect(precomputedEvents.upcomingEvents).toHaveLength(1);
    });

    it('includes events relevant to multiple sessions when session matches', () => {
      const events = [
        makeEvent({ title: 'Multi-session Event', importance: 'high', sessionRelevance: ['ASIA_CRYPTO', 'US_CRYPTO'] }),
      ];
      const { precomputedEvents } = preprocessEvents(events, 'US_CRYPTO');
      expect(precomputedEvents.upcomingEvents).toHaveLength(1);
    });

    it('sessionFiltered count reflects only session-relevant events', () => {
      const events = [
        makeEvent({ title: 'US Event', importance: 'high', sessionRelevance: ['US_CRYPTO'] }),
        makeEvent({ title: 'Asia Event', importance: 'high', sessionRelevance: ['ASIA_CRYPTO'] }),
        makeEvent({ title: 'Europe Event', importance: 'medium', sessionRelevance: ['EUROPE_CRYPTO'] }),
      ];
      const { precomputedEvents } = preprocessEvents(events, 'US_CRYPTO');
      expect(precomputedEvents.sessionFiltered).toBe(1);
    });
  });

  describe('sorting', () => {
    it('sorts critical before high before medium before low', () => {
      const events = [
        makeEvent({ title: 'Low', importance: 'low', scheduledTime: '2026-01-01T10:00:00Z' }),
        makeEvent({ title: 'Critical', importance: 'critical', scheduledTime: '2026-01-01T10:00:00Z' }),
        makeEvent({ title: 'Medium', importance: 'medium', scheduledTime: '2026-01-01T10:00:00Z' }),
        makeEvent({ title: 'High', importance: 'high', scheduledTime: '2026-01-01T10:00:00Z' }),
      ];
      const { precomputedEvents } = preprocessEvents(events, SESSION);
      const titles = precomputedEvents.upcomingEvents.map((e) => e.title);
      expect(titles).toEqual(['Critical', 'High', 'Medium', 'Low']);
    });

    it('sorts by scheduledTime ascending within same importance', () => {
      const events = [
        makeEvent({ title: 'Later', importance: 'high', scheduledTime: '2026-01-01T15:00:00Z' }),
        makeEvent({ title: 'Earlier', importance: 'high', scheduledTime: '2026-01-01T08:00:00Z' }),
        makeEvent({ title: 'Middle', importance: 'high', scheduledTime: '2026-01-01T12:00:00Z' }),
      ];
      const { precomputedEvents } = preprocessEvents(events, SESSION);
      const titles = precomputedEvents.upcomingEvents.map((e) => e.title);
      expect(titles).toEqual(['Earlier', 'Middle', 'Later']);
    });

    it('falls back to relevanceScore desc when time is equal', () => {
      const time = '2026-01-01T10:00:00Z';
      const events = [
        makeEvent({ title: 'LowScore', importance: 'high', scheduledTime: time, relevanceScore: 30 }),
        makeEvent({ title: 'HighScore', importance: 'high', scheduledTime: time, relevanceScore: 90 }),
      ];
      const { precomputedEvents } = preprocessEvents(events, SESSION);
      expect(precomputedEvents.upcomingEvents[0]!.title).toBe('HighScore');
    });

    it('uses detectedAt when scheduledTime is absent', () => {
      const events = [
        makeEvent({ title: 'No Schedule', importance: 'high', detectedAt: '2026-01-01T06:00:00Z' }),
        makeEvent({ title: 'Has Schedule', importance: 'high', scheduledTime: '2026-01-01T12:00:00Z', detectedAt: '2026-01-01T01:00:00Z' }),
      ];
      const { precomputedEvents } = preprocessEvents(events, SESSION);
      const titles = precomputedEvents.upcomingEvents.map((e) => e.title);
      expect(titles).toEqual(['No Schedule', 'Has Schedule']);
    });
  });

  describe('upcomingEvents', () => {
    it('caps upcomingEvents at maxUpcoming', () => {
      const events = Array.from({ length: 12 }, (_, i) =>
        makeEvent({ title: `Event ${i}`, importance: 'medium' }),
      );
      const { precomputedEvents } = preprocessEvents(events, SESSION, 5);
      expect(precomputedEvents.upcomingEvents).toHaveLength(5);
    });

    it('uses default cap of 8', () => {
      const events = Array.from({ length: 15 }, (_, i) =>
        makeEvent({ title: `Event ${i}`, importance: 'medium' }),
      );
      const { precomputedEvents } = preprocessEvents(events, SESSION);
      expect(precomputedEvents.upcomingEvents).toHaveLength(8);
    });

    it('uses scheduledTime as the time field in upcomingEvents', () => {
      const events = [makeEvent({ title: 'CPI', importance: 'critical', scheduledTime: '2026-01-02T13:30:00Z' })];
      const { precomputedEvents } = preprocessEvents(events, SESSION);
      expect(precomputedEvents.upcomingEvents[0]!.time).toBe('2026-01-02T13:30:00Z');
    });

    it('falls back to detectedAt when scheduledTime is absent', () => {
      const event = makeEvent({ title: 'Unscheduled', importance: 'high' });
      const { precomputedEvents } = preprocessEvents([event], SESSION);
      expect(precomputedEvents.upcomingEvents[0]!.time).toBe(event.detectedAt);
    });
  });

  describe('hasCritical flag', () => {
    it('is true when a critical event is in upcoming', () => {
      const events = [makeEvent({ title: 'CPI', importance: 'critical' })];
      const { precomputedEvents } = preprocessEvents(events, SESSION);
      expect(precomputedEvents.hasCritical).toBe(true);
    });

    it('is false when no critical events', () => {
      const events = [makeEvent({ title: 'Minor', importance: 'low' })];
      const { precomputedEvents } = preprocessEvents(events, SESSION);
      expect(precomputedEvents.hasCritical).toBe(false);
    });

    it('is false when empty events list', () => {
      const { precomputedEvents } = preprocessEvents([], SESSION);
      expect(precomputedEvents.hasCritical).toBe(false);
    });
  });

  describe('filteredEvents', () => {
    it('returns the deduped and session-filtered events for LLM context', () => {
      const events = [
        makeEvent({ title: 'US A', importance: 'critical', dedupeKey: 'us-a', sessionRelevance: ['US_CRYPTO'] }),
        makeEvent({ title: 'US A dup', importance: 'critical', dedupeKey: 'us-a', sessionRelevance: ['US_CRYPTO'] }),
        makeEvent({ title: 'Asia Only', importance: 'high', sessionRelevance: ['ASIA_CRYPTO'] }),
      ];
      const { filteredEvents } = preprocessEvents(events, 'US_CRYPTO');
      expect(filteredEvents).toHaveLength(1);
      expect(filteredEvents[0]!.title).toBe('US A');
    });
  });

  it('handles empty events list gracefully', () => {
    const { filteredEvents, precomputedEvents } = preprocessEvents([], SESSION);
    expect(filteredEvents).toHaveLength(0);
    expect(precomputedEvents.upcomingEvents).toHaveLength(0);
    expect(precomputedEvents.totalDeduped).toBe(0);
    expect(precomputedEvents.sessionFiltered).toBe(0);
    expect(precomputedEvents.hasCritical).toBe(false);
  });
});
