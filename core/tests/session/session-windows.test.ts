import { describe, it, expect } from 'vitest';
import {
  resolveActiveSession,
  getSessionBoundaryForDate,
  getPreviousSession,
  getPreviousSessionBoundaryForDate,
} from '../../src/session/session-windows.js';

function utcDate(hour: number): Date {
  return new Date(Date.UTC(2024, 0, 15, hour, 0, 0));
}

describe('resolveActiveSession', () => {
  it('returns ASIA_CRYPTO at hour 4', () => {
    expect(resolveActiveSession(utcDate(4))).toBe('ASIA_CRYPTO');
  });

  it('returns EUROPE_CRYPTO at hour 10', () => {
    expect(resolveActiveSession(utcDate(10))).toBe('EUROPE_CRYPTO');
  });

  it('returns US_CRYPTO at hour 18', () => {
    expect(resolveActiveSession(utcDate(18))).toBe('US_CRYPTO');
  });

  it('returns null at hour 23', () => {
    expect(resolveActiveSession(utcDate(23))).toBeNull();
  });
});

describe('getSessionBoundaryForDate', () => {
  it('returns correct ms boundaries for ASIA_CRYPTO', () => {
    const date = new Date(Date.UTC(2024, 0, 15, 4, 0, 0));
    const boundary = getSessionBoundaryForDate('ASIA_CRYPTO', date);
    const dayStart = Date.UTC(2024, 0, 15);
    expect(boundary.session).toBe('ASIA_CRYPTO');
    expect(boundary.startMs).toBe(dayStart + 0 * 3_600_000);
    expect(boundary.endMs).toBe(dayStart + 8 * 3_600_000);
  });

  it('returns correct ms boundaries for US_CRYPTO', () => {
    const date = new Date(Date.UTC(2024, 0, 15, 18, 0, 0));
    const boundary = getSessionBoundaryForDate('US_CRYPTO', date);
    const dayStart = Date.UTC(2024, 0, 15);
    expect(boundary.startMs).toBe(dayStart + 13 * 3_600_000);
    expect(boundary.endMs).toBe(dayStart + 21 * 3_600_000);
  });
});

describe('getPreviousSession', () => {
  it('ASIA_CRYPTO previous is US_CRYPTO', () => {
    expect(getPreviousSession('ASIA_CRYPTO')).toBe('US_CRYPTO');
  });

  it('EUROPE_CRYPTO previous is ASIA_CRYPTO', () => {
    expect(getPreviousSession('EUROPE_CRYPTO')).toBe('ASIA_CRYPTO');
  });

  it('US_CRYPTO previous is EUROPE_CRYPTO', () => {
    expect(getPreviousSession('US_CRYPTO')).toBe('EUROPE_CRYPTO');
  });

  it('forms a cycle', () => {
    const start = 'ASIA_CRYPTO' as const;
    const p1 = getPreviousSession(start);
    const p2 = getPreviousSession(p1);
    const p3 = getPreviousSession(p2);
    expect(p3).toBe(start);
  });
});

describe('getPreviousSessionBoundaryForDate', () => {
  // ASIA runs 00-08 UTC. Its previous session is US (13-21 UTC), which started
  // later in the UTC day — so it ran on the prior calendar day.
  it('ASIA_CRYPTO at 04:00 UTC returns US_CRYPTO boundary on the prior calendar day', () => {
    const now = new Date(Date.UTC(2024, 0, 15, 4, 0, 0)); // 2024-01-15 04:00 UTC
    const boundary = getPreviousSessionBoundaryForDate('ASIA_CRYPTO', now);
    const prevDayStart = Date.UTC(2024, 0, 14); // 2024-01-14
    expect(boundary.session).toBe('US_CRYPTO');
    expect(boundary.startMs).toBe(prevDayStart + 13 * 3_600_000);
    expect(boundary.endMs).toBe(prevDayStart + 21 * 3_600_000);
  });

  // EUROPE runs 07-16 UTC. Its previous session is ASIA (00-08 UTC), which started
  // earlier in the UTC day — same calendar day.
  it('EUROPE_CRYPTO returns ASIA_CRYPTO boundary on the same calendar day', () => {
    const now = new Date(Date.UTC(2024, 0, 15, 10, 0, 0)); // 2024-01-15 10:00 UTC
    const boundary = getPreviousSessionBoundaryForDate('EUROPE_CRYPTO', now);
    const dayStart = Date.UTC(2024, 0, 15);
    expect(boundary.session).toBe('ASIA_CRYPTO');
    expect(boundary.startMs).toBe(dayStart + 0 * 3_600_000);
    expect(boundary.endMs).toBe(dayStart + 8 * 3_600_000);
  });

  // US runs 13-21 UTC. Its previous session is EUROPE (07-16 UTC), which started
  // earlier in the UTC day — same calendar day.
  it('US_CRYPTO returns EUROPE_CRYPTO boundary on the same calendar day', () => {
    const now = new Date(Date.UTC(2024, 0, 15, 18, 0, 0)); // 2024-01-15 18:00 UTC
    const boundary = getPreviousSessionBoundaryForDate('US_CRYPTO', now);
    const dayStart = Date.UTC(2024, 0, 15);
    expect(boundary.session).toBe('EUROPE_CRYPTO');
    expect(boundary.startMs).toBe(dayStart + 7 * 3_600_000);
    expect(boundary.endMs).toBe(dayStart + 16 * 3_600_000);
  });

  it('crosses month boundary correctly for ASIA_CRYPTO on the 1st', () => {
    const now = new Date(Date.UTC(2024, 1, 1, 3, 0, 0)); // 2024-02-01 03:00 UTC
    const boundary = getPreviousSessionBoundaryForDate('ASIA_CRYPTO', now);
    const prevDayStart = Date.UTC(2024, 0, 31); // 2024-01-31
    expect(boundary.session).toBe('US_CRYPTO');
    expect(boundary.startMs).toBe(prevDayStart + 13 * 3_600_000);
  });
});
