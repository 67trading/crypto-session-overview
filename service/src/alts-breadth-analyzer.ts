import type { OverviewMarketSnapshot, AltsBreadthSummary } from './ports.js';

export type { AltsBreadthSummary } from './ports.js';

const BROAD_ROTATION_BREADTH_THRESHOLD = 65;
const SELECTIVE_ROTATION_BREADTH_THRESHOLD = 35;
const OUTPERFORMANCE_MARGIN = 0.003; // 0.3% above BTC to count as alts outperforming
const WEAK_RETURN_THRESHOLD = -0.01; // -1% average alt return for 'weak' classification

export function analyzeAltsBreadth(
  snapshots: OverviewMarketSnapshot[],
  excludeSymbols: string[] = ['BTCUSDT', 'ETHUSDT'],
): AltsBreadthSummary {
  const btcSnapshot = snapshots.find((s) => s.symbol === 'BTCUSDT');
  const btcReturn = computeDailyReturn(btcSnapshot);

  const altSnapshots = snapshots.filter((s) => !excludeSymbols.includes(s.symbol));

  if (altSnapshots.length === 0) {
    return {
      breadthPercent: 0,
      positiveCount: 0,
      totalTracked: 0,
      breadthLabel: 'data unavailable',
      rotationState: 'unknown',
    };
  }

  const returns = altSnapshots.map((s) => computeDailyReturn(s));
  const positiveCount = returns.filter((r) => r > 0).length;
  const breadthPercent = Math.round((positiveCount / altSnapshots.length) * 100);
  const avgAltReturn = returns.reduce((a, b) => a + b, 0) / returns.length;

  const breadthLabel = `${breadthPercent}% of ${altSnapshots.length} tracked alts positive on 24h`;
  const rotationState = deriveRotationState(breadthPercent, avgAltReturn, btcReturn);

  return {
    breadthPercent,
    positiveCount,
    totalTracked: altSnapshots.length,
    breadthLabel,
    rotationState,
    sourceScope: 'tracked_basket',
    basketName: 'configured_tracked_alts',
    symbols: altSnapshots.map((snapshot) => snapshot.symbol),
    timeBasis: 'utc_daily_candle',
  };
}

function computeDailyReturn(snapshot: OverviewMarketSnapshot | undefined): number {
  if (snapshot === undefined) return 0;
  const lastCandle = snapshot.candles.daily.at(-1);
  const prevCandle = snapshot.candles.daily.at(-2);
  if (lastCandle === undefined || prevCandle === undefined || prevCandle.close === 0) return 0;
  return (lastCandle.close - prevCandle.close) / prevCandle.close;
}

function deriveRotationState(
  breadthPercent: number,
  avgAltReturn: number,
  btcReturn: number,
): AltsBreadthSummary['rotationState'] {
  const altsOutperforming = avgAltReturn > btcReturn + OUTPERFORMANCE_MARGIN;

  if (breadthPercent >= BROAD_ROTATION_BREADTH_THRESHOLD && altsOutperforming) return 'broad_rotation';
  if (breadthPercent >= SELECTIVE_ROTATION_BREADTH_THRESHOLD) return 'selective_rotation';
  if (avgAltReturn < WEAK_RETURN_THRESHOLD) return 'weak';
  return 'no_rotation';
}
