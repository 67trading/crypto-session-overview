import type { CryptoSession } from './ports.js';

export type SessionDisplay = {
  title: string;
  localTimeZone: string;
  localTimeLabel: string;
  previousSessionLabel: string;
  currentSessionLabel: string;
};

export const SESSION_DISPLAY: Record<CryptoSession, SessionDisplay> = {
  ASIA_CRYPTO: {
    title: 'Crypto Asia Brief',
    localTimeZone: 'Asia/Singapore',
    localTimeLabel: 'SGT',
    previousSessionLabel: 'US',
    currentSessionLabel: 'Asia',
  },
  EUROPE_CRYPTO: {
    title: 'Crypto Europe Brief',
    localTimeZone: 'Europe/Berlin',
    localTimeLabel: 'FFM',
    previousSessionLabel: 'Asia',
    currentSessionLabel: 'Europe',
  },
  US_CRYPTO: {
    title: 'Crypto US Brief',
    localTimeZone: 'America/New_York',
    localTimeLabel: 'NY',
    previousSessionLabel: 'Europe',
    currentSessionLabel: 'US',
  },
};

export function getSessionDisplay(session: CryptoSession): SessionDisplay {
  return SESSION_DISPLAY[session];
}
