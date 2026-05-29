import { describe, it, expect } from 'vitest';
import { analyzeCrossMarket } from '../src/cross-market-analyzer.js';
import type { OverviewMarketSnapshot } from '../src/ports.js';

function makeCandle(close: number) {
  return {
    openTimeMs: 0,
    closeTimeMs: 0,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1000,
  };
}

function makeSnapshot(
  symbol: string,
  dailyCloses: number[],
): OverviewMarketSnapshot {
  return {
    symbol,
    latestPrice: dailyCloses.at(-1) ?? 0,
    candles: {
      weekly: [],
      daily: dailyCloses.map(makeCandle),
      fourHour: [],
    },
  };
}

// 8 daily closes: index -8 = first, index -1 = last
function btcCandles(pastClose: number, currentClose: number): number[] {
  // Fill 8 entries: first is pastClose, last is currentClose
  return [pastClose, pastClose, pastClose, pastClose, pastClose, pastClose, pastClose, currentClose];
}

describe('analyzeCrossMarket()', () => {
  describe('ETH/BTC ratio trend', () => {
    it('detects rising trend when ETH/BTC ratio increases by > 2%', () => {
      const snapshots = [
        makeSnapshot('BTCUSDT', btcCandles(100_000, 100_000)), // flat BTC
        makeSnapshot('ETHUSDT', btcCandles(3_000, 3_100)),     // ETH +3.3% → ratio rises
      ];
      const result = analyzeCrossMarket(snapshots);
      expect(result.ethBtcTrendLabel).toContain('rising');
      expect(result.ethBtcTrendLabel).toContain('ETH/BTC');
    });

    it('detects falling trend when ETH/BTC ratio decreases by > 2%', () => {
      const snapshots = [
        makeSnapshot('BTCUSDT', btcCandles(100_000, 100_000)),
        makeSnapshot('ETHUSDT', btcCandles(3_000, 2_900)),     // ETH -3.3% → ratio falls
      ];
      const result = analyzeCrossMarket(snapshots);
      expect(result.ethBtcTrendLabel).toContain('falling');
    });

    it('detects sideways when ratio change is within ±2%', () => {
      const snapshots = [
        makeSnapshot('BTCUSDT', btcCandles(100_000, 100_000)),
        makeSnapshot('ETHUSDT', btcCandles(3_000, 3_030)),     // +1% → sideways
      ];
      const result = analyzeCrossMarket(snapshots);
      expect(result.ethBtcTrendLabel).toContain('sideways');
    });

    it('includes percentage change in the label', () => {
      const snapshots = [
        makeSnapshot('BTCUSDT', btcCandles(100_000, 100_000)),
        makeSnapshot('ETHUSDT', btcCandles(3_000, 3_150)),     // +5%
      ];
      const result = analyzeCrossMarket(snapshots);
      expect(result.ethBtcTrendLabel).toMatch(/\+\d+\.\d+%/);
    });

    it('returns data unavailable when ETH snapshot is missing', () => {
      const snapshots = [
        makeSnapshot('BTCUSDT', btcCandles(100_000, 100_000)),
      ];
      const result = analyzeCrossMarket(snapshots);
      expect(result.ethBtcTrendLabel).toBe('data unavailable');
    });

    it('returns data unavailable when BTC snapshot is missing', () => {
      const snapshots = [
        makeSnapshot('ETHUSDT', btcCandles(3_000, 3_100)),
      ];
      const result = analyzeCrossMarket(snapshots);
      expect(result.ethBtcTrendLabel).toBe('data unavailable');
    });

    it('returns data unavailable when fewer than 8 daily candles are available', () => {
      const snapshots = [
        makeSnapshot('BTCUSDT', [100_000, 100_000]), // only 2 candles
        makeSnapshot('ETHUSDT', [3_000, 3_100]),
      ];
      const result = analyzeCrossMarket(snapshots);
      // With only 2 candles, index -8 returns undefined → falls back
      expect(result.ethBtcTrendLabel).toBe('data unavailable');
    });
  });

  describe('dominance signal', () => {
    it('dominance falling when ETH/BTC rising', () => {
      const snapshots = [
        makeSnapshot('BTCUSDT', btcCandles(100_000, 100_000)),
        makeSnapshot('ETHUSDT', btcCandles(3_000, 3_100)), // +3.3%
      ];
      const result = analyzeCrossMarket(snapshots);
      expect(result.dominanceSignal).toBe('falling');
    });

    it('dominance rising when ETH/BTC falling', () => {
      const snapshots = [
        makeSnapshot('BTCUSDT', btcCandles(100_000, 100_000)),
        makeSnapshot('ETHUSDT', btcCandles(3_000, 2_900)), // -3.3%
      ];
      const result = analyzeCrossMarket(snapshots);
      expect(result.dominanceSignal).toBe('rising');
    });

    it('dominance falling when majority of majors outperform BTC even without ETH/BTC trend data', () => {
      const snapshots = [
        makeSnapshot('BTCUSDT', [100_000, 100_000]),   // flat
        makeSnapshot('SOLUSDT', [200, 210]),            // +5% — no 8-candle history so no ratio trend
        makeSnapshot('BNBUSDT', [600, 630]),            // +5%
        makeSnapshot('XRPUSDT', [0.5, 0.525]),         // +5%
      ];
      const result = analyzeCrossMarket(snapshots);
      expect(result.dominanceSignal).toBe('falling');
    });

    it('dominance unknown when no snapshots provided', () => {
      const result = analyzeCrossMarket([]);
      expect(result.dominanceSignal).toBe('unknown');
    });

    it('dominanceLabel is a non-empty string in all cases', () => {
      const result = analyzeCrossMarket([]);
      expect(typeof result.dominanceLabel).toBe('string');
      expect(result.dominanceLabel.length).toBeGreaterThan(0);
    });
  });

  describe('relative strength', () => {
    it('identifies top outperformers vs BTC', () => {
      const snapshots = [
        makeSnapshot('BTCUSDT', [100_000, 100_000]),  // flat
        makeSnapshot('SOLUSDT', [200, 210]),           // +5%
        makeSnapshot('BNBUSDT', [600, 615]),           // +2.5%
        makeSnapshot('ETHUSDT', btcCandles(3_000, 3_000)),
      ];
      const result = analyzeCrossMarket(snapshots);
      expect(result.topOutperformers.length).toBeGreaterThan(0);
      expect(result.topOutperformers.some((s) => s.includes('SOL'))).toBe(true);
    });

    it('identifies top underperformers vs BTC', () => {
      const snapshots = [
        makeSnapshot('BTCUSDT', [100_000, 100_000]),  // flat
        makeSnapshot('DOGUSDT', [0.1, 0.093]),        // -7%
        makeSnapshot('ETHUSDT', btcCandles(3_000, 3_000)),
      ];
      const result = analyzeCrossMarket(snapshots);
      expect(result.topUnderperformers.length).toBeGreaterThan(0);
      expect(result.topUnderperformers.some((s) => s.includes('DOG'))).toBe(true);
    });

    it('caps topOutperformers and topUnderperformers at 3 each', () => {
      const btc = makeSnapshot('BTCUSDT', [100_000, 100_000]);
      const eth = makeSnapshot('ETHUSDT', btcCandles(3_000, 3_000));
      const winners = ['SOL', 'BNB', 'ADA', 'DOT', 'AVAX'].map((sym) =>
        makeSnapshot(`${sym}USDT`, [100, 110]),  // all +10%
      );
      const result = analyzeCrossMarket([btc, eth, ...winners]);
      expect(result.topOutperformers.length).toBeLessThanOrEqual(3);
    });

    it('returns empty arrays when no majors have data', () => {
      const result = analyzeCrossMarket([
        makeSnapshot('BTCUSDT', btcCandles(100_000, 100_000)),
        makeSnapshot('ETHUSDT', btcCandles(3_000, 3_000)),
      ]);
      // ETH vs BTC: flat → in_line → excluded from topOutperformers/topUnderperformers
      // No other symbols
      expect(result.topOutperformers).toHaveLength(0);
      expect(result.topUnderperformers).toHaveLength(0);
    });

    it('label format includes symbol name and percentage', () => {
      const snapshots = [
        makeSnapshot('BTCUSDT', [100_000, 100_000]),
        makeSnapshot('SOLUSDT', [200, 215]), // +7.5%
        makeSnapshot('ETHUSDT', btcCandles(3_000, 3_000)),
      ];
      const result = analyzeCrossMarket(snapshots);
      expect(result.topOutperformers[0]).toMatch(/SOL.*%.*BTC/);
    });
  });

  describe('output shape', () => {
    it('always returns all required fields', () => {
      const result = analyzeCrossMarket([]);
      expect(result).toHaveProperty('ethBtcTrendLabel');
      expect(result).toHaveProperty('dominanceSignal');
      expect(result).toHaveProperty('dominanceLabel');
      expect(result).toHaveProperty('topOutperformers');
      expect(result).toHaveProperty('topUnderperformers');
    });
  });
});
