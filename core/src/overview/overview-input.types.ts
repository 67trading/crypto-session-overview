import type { CryptoSession } from '../session/session.types.js';
import type { SessionContext } from '../context/session-context.js';
import type { NormalizedEvent } from '../events/event.types.js';
import type { WeeklyLevels, DailyLevels, FourHourLevels } from '../levels/htf-levels.js';

export type DerivativesContext = {
  symbol: string;
  fundingStatus:
    | 'negative_extreme' | 'negative_elevated' | 'neutral'
    | 'positive_elevated' | 'positive_extreme' | 'unknown';
  oiStatus: 'falling' | 'stable' | 'rising' | 'rising_fast' | 'unknown';
  positioningStatus: 'long_heavy' | 'short_heavy' | 'balanced' | 'unknown';
};

export type ActiveOverviewSetup = {
  setupId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  setupType: string;
  timeframeSource: 'Weekly' | 'Daily' | '4H' | 'Session';
  status: string;
  relevantZone?: { low: number; high: number };
  invalidation?: number;
};

export type HtfLevelsSnapshot = {
  weekly: WeeklyLevels | null;
  daily: DailyLevels | null;
  fourHour: FourHourLevels | null;
};

export type OverviewInput = {
  request: {
    session: CryptoSession;
    createdAt: string;
    timezone: string;
    allowedTimeframes: readonly ['Weekly', 'Daily', '4H', 'Session'];
    forbiddenTimeframes: readonly ['1H', '15m', '5m'];
  };
  universe: {
    coreSymbols: string[];
    majorSymbols: string[];
    watchSymbols: string[];
  };
  marketContext: {
    btcTone: string;
    ethVsBtc: string;
    btcDominance?: string;
    altcoinRotation?: string;
    totalCryptoTone?: string;
  };
  levels: Record<string, HtfLevelsSnapshot>;
  sessionContext: SessionContext | null;
  derivativesContext: Record<string, DerivativesContext>;
  eventsForSession: NormalizedEvent[];
  activeSetups: ActiveOverviewSetup[];
};
