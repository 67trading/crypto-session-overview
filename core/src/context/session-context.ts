import type { CryptoSession, SessionBoundary } from '../session/session.types.js';
import type { HtfCandle } from '../levels/htf-levels.js';
import { computeMidpoint } from '../levels/htf-levels.js';

export type SessionHighLow = {
  session: CryptoSession;
  high: number;
  low: number;
  midpoint: number;
  open: number;
  close: number;
};

export type SessionContinuationRead =
  | 'continuation_bullish'
  | 'continuation_bearish'
  | 'rejection_from_high'
  | 'rejection_from_low'
  | 'inside_range'
  | 'breakout_above'
  | 'breakout_below'
  | 'unknown';

export type SessionContext = {
  currentSession: CryptoSession;
  currentBoundary?: SessionBoundary;
  previousBoundary?: SessionBoundary;
  previousSessionHighLow?: SessionHighLow;
  currentSessionOpen?: number;
  currentSessionOpenStatus?: 'confirmed' | 'not_started' | 'unavailable';
  priceVsPreviousSession?: SessionContinuationRead;
};

function candleOverlapsBoundary(candle: HtfCandle, boundary: { startMs: number; endMs: number }): boolean {
  return candle.openTimeMs < boundary.endMs && candle.closeTimeMs > boundary.startMs;
}

export function extractSessionHighLow(
  session: CryptoSession,
  candles: HtfCandle[],
  boundary: { startMs: number; endMs: number }
): SessionHighLow | null {
  const filtered = candles.filter((c) => candleOverlapsBoundary(c, boundary));
  if (filtered.length === 0) return null;

  const high = Math.max(...filtered.map((c) => c.high));
  const low = Math.min(...filtered.map((c) => c.low));
  const open = filtered[0]!.open;
  const close = filtered[filtered.length - 1]!.close;
  const midpoint = computeMidpoint(high, low);

  return { session, high, low, midpoint, open, close };
}

export function detectSessionContinuation(
  currentPrice: number,
  previousSession: SessionHighLow
): SessionContinuationRead {
  const { high, low, midpoint, open } = previousSession;
  const range = high - low;

  if (currentPrice > previousSession.high * 1.001) return 'breakout_above';
  if (currentPrice < previousSession.low * 0.999) return 'breakout_below';

  // Top 20% of range
  if (currentPrice >= high - range * 0.2) return 'rejection_from_high';
  // Bottom 20% of range
  if (currentPrice <= low + range * 0.2) return 'rejection_from_low';

  if (open > midpoint && currentPrice > open) return 'continuation_bullish';
  if (open < midpoint && currentPrice < open) return 'continuation_bearish';

  return 'inside_range';
}

function findCurrentSessionOpen(
  candles: HtfCandle[],
  currentBoundary: SessionBoundary,
  now: Date,
): { open?: number; status: 'confirmed' | 'not_started' | 'unavailable' } {
  if (now.getTime() < currentBoundary.startMs) return { status: 'not_started' };
  const firstCurrentCandle = candles.find((c) => candleOverlapsBoundary(c, currentBoundary));
  if (firstCurrentCandle === undefined) return { status: 'unavailable' };
  return { open: firstCurrentCandle.open, status: 'confirmed' };
}

export function buildSessionContext(params: {
  session: CryptoSession;
  currentPrice: number;
  fourHourCandles: HtfCandle[];
  currentBoundary: SessionBoundary;
  previousBoundary: SessionBoundary | null;
  now: Date;
}): SessionContext {
  const { session, currentPrice, fourHourCandles, currentBoundary, previousBoundary, now } = params;
  if (previousBoundary === null) {
    const currentOpen = findCurrentSessionOpen(fourHourCandles, currentBoundary, now);
    return {
      currentSession: session,
      currentBoundary,
      currentSessionOpenStatus: currentOpen.status,
      ...(currentOpen.open !== undefined ? { currentSessionOpen: currentOpen.open } : {}),
    };
  }

  const previousSessionHighLow = extractSessionHighLow(
    previousBoundary.session,
    fourHourCandles,
    previousBoundary
  );

  const currentOpen = findCurrentSessionOpen(fourHourCandles, currentBoundary, now);

  const priceVsPreviousSession =
    previousSessionHighLow !== null
      ? detectSessionContinuation(currentPrice, previousSessionHighLow)
      : undefined;

  const ctx: SessionContext = {
    currentSession: session,
    currentBoundary,
    previousBoundary,
    currentSessionOpenStatus: currentOpen.status,
  };
  if (previousSessionHighLow !== null) ctx.previousSessionHighLow = previousSessionHighLow;
  if (currentOpen.open !== undefined) ctx.currentSessionOpen = currentOpen.open;
  if (priceVsPreviousSession !== undefined) ctx.priceVsPreviousSession = priceVsPreviousSession;
  return ctx;
}
