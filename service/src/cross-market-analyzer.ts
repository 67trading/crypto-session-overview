import type { OverviewMarketSnapshot, CrossMarketSummary } from './ports.js';

export type { CrossMarketSummary } from './ports.js';

const ETH_BTC_TREND_THRESHOLD = 0.02; // 2% 7-day change to call a trend
const RS_STRONG_THRESHOLD = 0.03;     // 3% vs BTC = strongly out/underperforming
const RS_THRESHOLD = 0.01;            // 1% vs BTC = out/underperforming
const TOP_MOVERS_COUNT = 3;

function computeDailyReturn(candles: OverviewMarketSnapshot['candles']['daily']): number | null {
  const last = candles.at(-1);
  const prev = candles.at(-2);
  if (last === undefined || prev === undefined || prev.close === 0) return null;
  return (last.close - prev.close) / prev.close;
}

function computeRatio(ethCandles: OverviewMarketSnapshot['candles']['daily'], btcCandles: OverviewMarketSnapshot['candles']['daily'], index: number): number | null {
  const eth = ethCandles.at(index);
  const btc = btcCandles.at(index);
  if (eth === undefined || btc === undefined || btc.close === 0) return null;
  return eth.close / btc.close;
}

function classifyRs(vsbtcReturn: number): string {
  if (vsbtcReturn > RS_STRONG_THRESHOLD) return 'strongly_outperforming';
  if (vsbtcReturn > RS_THRESHOLD) return 'outperforming';
  if (vsbtcReturn < -RS_STRONG_THRESHOLD) return 'strongly_underperforming';
  if (vsbtcReturn < -RS_THRESHOLD) return 'underperforming';
  return 'in_line';
}

function fmtSymbol(symbol: string): string {
  return symbol.replace(/USDT$/, '').replace(/USD$/, '');
}

function fmtPct(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${(n * 100).toFixed(1)}%`;
}

export function analyzeCrossMarket(snapshots: OverviewMarketSnapshot[]): CrossMarketSummary {
  const btc = snapshots.find((s) => s.symbol === 'BTCUSDT');
  const eth = snapshots.find((s) => s.symbol === 'ETHUSDT');

  // ETH/BTC ratio trend (7-day window)
  let ethBtcTrendLabel = 'data unavailable';
  let dominanceSignal: CrossMarketSummary['dominanceSignal'] = 'unknown';

  if (btc !== undefined && eth !== undefined) {
    const currentRatio = computeRatio(eth.candles.daily, btc.candles.daily, -1);
    const pastRatio = computeRatio(eth.candles.daily, btc.candles.daily, -8);

    if (currentRatio !== null && pastRatio !== null) {
      const ratioChange = (currentRatio - pastRatio) / pastRatio;
      const trend = ratioChange > ETH_BTC_TREND_THRESHOLD ? 'rising'
        : ratioChange < -ETH_BTC_TREND_THRESHOLD ? 'falling'
        : 'sideways';

      const direction = trend === 'rising' ? 'rising — ETH gaining vs BTC'
        : trend === 'falling' ? 'falling — ETH losing vs BTC'
        : 'sideways';
      ethBtcTrendLabel = `ETH/BTC ${direction} (${fmtPct(ratioChange)} over 7d)`;
      dominanceSignal = trend === 'rising' ? 'falling' : trend === 'falling' ? 'rising' : 'mixed';
    }
  }

  // Major relative strength vs BTC
  const btcReturn = btc !== undefined ? computeDailyReturn(btc.candles.daily) : null;

  type RsEntry = { symbol: string; vsbtc: number; classification: string };
  const rsEntries: RsEntry[] = [];

  for (const snap of snapshots) {
    if (snap.symbol === 'BTCUSDT' || snap.symbol === 'ETHUSDT') continue;
    const ret = computeDailyReturn(snap.candles.daily);
    if (ret === null || btcReturn === null) continue;
    const vsbtc = ret - btcReturn;
    rsEntries.push({ symbol: snap.symbol, vsbtc, classification: classifyRs(vsbtc) });
  }

  // Also include ETH vs BTC as a relative strength entry
  if (eth !== undefined && btcReturn !== null) {
    const ethReturn = computeDailyReturn(eth.candles.daily);
    if (ethReturn !== null) {
      const vsbtc = ethReturn - btcReturn;
      rsEntries.push({ symbol: 'ETHUSDT', vsbtc, classification: classifyRs(vsbtc) });
    }
  }

  rsEntries.sort((a, b) => b.vsbtc - a.vsbtc);

  const topOutperformers = rsEntries
    .filter((e) => e.vsbtc > RS_THRESHOLD)
    .slice(0, TOP_MOVERS_COUNT)
    .map((e) => `${fmtSymbol(e.symbol)} (${fmtPct(e.vsbtc)} vs BTC)`);

  const topUnderperformers = rsEntries
    .filter((e) => e.vsbtc < -RS_THRESHOLD)
    .slice(-TOP_MOVERS_COUNT)
    .reverse()
    .map((e) => `${fmtSymbol(e.symbol)} (${fmtPct(e.vsbtc)} vs BTC)`);

  // Refine dominance signal using relative strength consensus
  if (dominanceSignal === 'unknown' && rsEntries.length > 0) {
    const outCount = rsEntries.filter((e) => e.vsbtc > RS_THRESHOLD).length;
    const underCount = rsEntries.filter((e) => e.vsbtc < -RS_THRESHOLD).length;
    if (outCount > rsEntries.length / 2) dominanceSignal = 'falling';
    else if (underCount > rsEntries.length / 2) dominanceSignal = 'rising';
    else dominanceSignal = 'mixed';
  }

  const dominanceLabel = dominanceSignal === 'rising'
    ? 'BTC dominance likely rising — alts underperforming broadly'
    : dominanceSignal === 'falling'
    ? 'BTC dominance likely falling — alts gaining ground vs BTC'
    : dominanceSignal === 'mixed'
    ? 'Dominance mixed — selective relative strength across majors'
    : 'Dominance data unavailable';

  return {
    ethBtcTrendLabel,
    dominanceSignal,
    dominanceLabel,
    topOutperformers,
    topUnderperformers,
  };
}
