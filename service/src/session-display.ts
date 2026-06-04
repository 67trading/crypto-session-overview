import type { CryptoSession } from './ports.js';
import { getPreviousSession } from '../../core/src/index.js';

export type SessionDisplay = {
  title: string;
  localTimeZone: string;
  localTimeLabel: string;
  previousSessionLabel: string;
  currentSessionLabel: string;
};

const SESSION_DETAILS: Record<CryptoSession, Omit<SessionDisplay, 'previousSessionLabel'>> = {
  ASIA_CRYPTO: {
    title: 'Crypto Asia Brief',
    localTimeZone: 'Asia/Singapore',
    localTimeLabel: 'SGT',
    currentSessionLabel: 'Asia',
  },
  EUROPE_CRYPTO: {
    title: 'Crypto Europe Brief',
    localTimeZone: 'Europe/Berlin',
    localTimeLabel: 'FFM',
    currentSessionLabel: 'Europe',
  },
  US_CRYPTO: {
    title: 'Crypto US Brief',
    localTimeZone: 'America/New_York',
    localTimeLabel: 'NY',
    currentSessionLabel: 'US',
  },
};

export function getSessionDisplay(session: CryptoSession): SessionDisplay {
  const details = SESSION_DETAILS[session];
  const previous = SESSION_DETAILS[getPreviousSession(session)];
  return {
    ...details,
    previousSessionLabel: previous.currentSessionLabel,
  };
}

export const SESSION_DISPLAY: Record<CryptoSession, SessionDisplay> = {
  ASIA_CRYPTO: getSessionDisplay('ASIA_CRYPTO'),
  EUROPE_CRYPTO: getSessionDisplay('EUROPE_CRYPTO'),
  US_CRYPTO: getSessionDisplay('US_CRYPTO'),
};
