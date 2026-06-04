import type { CryptoSession, SessionWindow, SessionBoundary } from './session.types.js';

export const SESSION_WINDOWS: Record<CryptoSession, SessionWindow> = {
  ASIA_CRYPTO:   { session: 'ASIA_CRYPTO',   startUtcHour: 0,  endUtcHour: 8  },
  EUROPE_CRYPTO: { session: 'EUROPE_CRYPTO', startUtcHour: 7,  endUtcHour: 16 },
  US_CRYPTO:     { session: 'US_CRYPTO',     startUtcHour: 13, endUtcHour: 21 },
};

// Returns first matching session for a UTC date, or null if none matches
export function resolveActiveSession(utcDate: Date): CryptoSession | null {
  const hour = utcDate.getUTCHours();
  for (const [session, window] of Object.entries(SESSION_WINDOWS) as [CryptoSession, SessionWindow][]) {
    if (hour >= window.startUtcHour && hour < window.endUtcHour) {
      return session;
    }
  }
  return null;
}

// Returns start/end ms for a session on the same UTC day as utcDate
export function getSessionBoundaryForDate(session: CryptoSession, utcDate: Date): SessionBoundary {
  const window = SESSION_WINDOWS[session];
  const dayStart = Date.UTC(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), utcDate.getUTCDate());
  return {
    session,
    startMs: dayStart + window.startUtcHour * 3_600_000,
    endMs: dayStart + window.endUtcHour * 3_600_000,
  };
}

// ASIA → US → EUROPE → ASIA cycle
export function getPreviousSession(session: CryptoSession): CryptoSession {
  switch (session) {
    case 'ASIA_CRYPTO': return 'US_CRYPTO';
    case 'EUROPE_CRYPTO': return 'ASIA_CRYPTO';
    case 'US_CRYPTO': return 'EUROPE_CRYPTO';
  }
}

// Returns the boundary for the session that preceded `session` relative to utcDate,
// shifting to the prior calendar day when the previous session runs later in the UTC
// day than the current one (e.g. ASIA at 00:00 → previous US at 13:00 was yesterday).
export function getPreviousSessionBoundaryForDate(session: CryptoSession, utcDate: Date): SessionBoundary {
  const prev = getPreviousSession(session);
  const prevWindow = SESSION_WINDOWS[prev];
  const currentWindow = SESSION_WINDOWS[session];
  const date = prevWindow.startUtcHour > currentWindow.startUtcHour
    ? new Date(Date.UTC(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), utcDate.getUTCDate() - 1))
    : utcDate;
  return getSessionBoundaryForDate(prev, date);
}

function getDatePartInTimeZone(date: Date, timeZone: string, partType: 'year' | 'month' | 'day'): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = parts.find((p) => p.type === partType)?.value;
  if (part === undefined) throw new Error(`Could not resolve ${partType} for timezone ${timeZone}`);
  return Number(part);
}

export function getSessionBoundaryForScheduledRun(params: {
  session: CryptoSession;
  runAt: Date;
  scheduleTimezone: string;
}): SessionBoundary {
  const year = getDatePartInTimeZone(params.runAt, params.scheduleTimezone, 'year');
  const month = getDatePartInTimeZone(params.runAt, params.scheduleTimezone, 'month');
  const day = getDatePartInTimeZone(params.runAt, params.scheduleTimezone, 'day');
  return getSessionBoundaryForDate(params.session, new Date(Date.UTC(year, month - 1, day)));
}
