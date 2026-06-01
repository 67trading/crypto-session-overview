import { describe, it, expect } from 'vitest';
import { computeDataStatus, buildSourceHealthSummary } from '../src/source-health-evaluator.js';
import type { CollectorDataQuality } from '../src/ports.js';

function makeCollector(
  status: 'success' | 'partial' | 'failed' | 'skipped',
  itemCount: number,
  name = 'test-collector',
): CollectorDataQuality {
  return { name, status, itemCount };
}

describe('computeDataStatus()', () => {
  it('price is fresh when priceOk=true', () => {
    const result = computeDataStatus({ priceOk: true, derivativesOk: true, eventCollectors: [] });
    expect(result.price).toBe('fresh');
  });

  it('price is failed when priceOk=false', () => {
    const result = computeDataStatus({ priceOk: false, derivativesOk: true, eventCollectors: [] });
    expect(result.price).toBe('failed');
  });

  it('derivatives is fresh when derivativesOk=true', () => {
    const result = computeDataStatus({ priceOk: true, derivativesOk: true, eventCollectors: [] });
    expect(result.derivatives).toBe('fresh');
  });

  it('derivatives is failed when derivativesOk=false', () => {
    const result = computeDataStatus({ priceOk: true, derivativesOk: false, eventCollectors: [] });
    expect(result.derivatives).toBe('failed');
  });

  it('liquidations is always unavailable', () => {
    const result = computeDataStatus({ priceOk: true, derivativesOk: true, eventCollectors: [] });
    expect(result.liquidations).toBe('unavailable');
  });

  describe('events status aggregation', () => {
    it('is unavailable when no collectors', () => {
      const result = computeDataStatus({ priceOk: true, derivativesOk: true, eventCollectors: [] });
      expect(result.events).toBe('unavailable');
    });

    it('is fresh when all collectors succeed with items', () => {
      const collectors = [
        makeCollector('success', 5, 'bybit'),
        makeCollector('success', 3, 'fed-calendar'),
      ];
      const result = computeDataStatus({ priceOk: true, derivativesOk: true, eventCollectors: collectors });
      expect(result.events).toBe('fresh');
    });

    it('is partial when some collectors fail and some succeed with items', () => {
      const collectors = [
        makeCollector('success', 5, 'bybit'),
        makeCollector('failed', 0, 'sec-rss'),
      ];
      const result = computeDataStatus({ priceOk: true, derivativesOk: true, eventCollectors: collectors });
      expect(result.events).toBe('partial');
    });

    it('is fresh when all collectors succeed but return 0 items (quiet session)', () => {
      const collectors = [
        makeCollector('success', 0, 'bybit'),
        makeCollector('success', 0, 'fed-calendar'),
      ];
      const result = computeDataStatus({ priceOk: true, derivativesOk: true, eventCollectors: collectors });
      expect(result.events).toBe('fresh');
    });

    it('is partial when all failed except one with items', () => {
      const collectors = [
        makeCollector('success', 5, 'bybit'),
        makeCollector('failed', 0, 'sec-rss'),
        makeCollector('failed', 0, 'bls'),
      ];
      const result = computeDataStatus({ priceOk: true, derivativesOk: true, eventCollectors: collectors });
      expect(result.events).toBe('partial');
    });

    it('is failed when all collectors fail', () => {
      const collectors = [
        makeCollector('failed', 0, 'bybit'),
        makeCollector('failed', 0, 'fed-calendar'),
        makeCollector('failed', 0, 'bls'),
      ];
      const result = computeDataStatus({ priceOk: true, derivativesOk: true, eventCollectors: collectors });
      expect(result.events).toBe('failed');
    });

    it('is fresh with a single successful collector with items', () => {
      const result = computeDataStatus({
        priceOk: true,
        derivativesOk: true,
        eventCollectors: [makeCollector('success', 12)],
      });
      expect(result.events).toBe('fresh');
    });

    it('distinguishes 0-items-succeeded (fresh) from error-failed (failed vs partial)', () => {
      // One zero-items, no errors → fresh (quiet session, not a data problem)
      const zeroItems = [makeCollector('success', 0)];
      const failResult = computeDataStatus({ priceOk: true, derivativesOk: true, eventCollectors: zeroItems });
      expect(failResult.events).toBe('fresh');

      // All erroring → failed
      const allFail = [makeCollector('failed', 0), makeCollector('failed', 0)];
      const allFailResult = computeDataStatus({ priceOk: true, derivativesOk: true, eventCollectors: allFail });
      expect(allFailResult.events).toBe('failed');
    });
  });

  it('returns all four fields in every case', () => {
    const result = computeDataStatus({
      priceOk: true,
      derivativesOk: true,
      eventCollectors: [makeCollector('success', 5)],
    });
    expect(result).toHaveProperty('price');
    expect(result).toHaveProperty('events');
    expect(result).toHaveProperty('derivatives');
    expect(result).toHaveProperty('liquidations');
  });
});

describe('buildSourceHealthSummary()', () => {
  it('counts healthy, failed, and skipped collectors correctly', () => {
    const collectors: CollectorDataQuality[] = [
      makeCollector('success', 10, 'bybit'),
      makeCollector('failed', 0, 'mobula'),
      makeCollector('skipped', 0, 'coinmarketcap-etf'),
      makeCollector('success', 3, 'coingecko'),
    ];
    const summary = buildSourceHealthSummary(collectors);
    expect(summary.healthyCount).toBe(2);
    expect(summary.failedCount).toBe(1);
    expect(summary.skippedCount).toBe(1);
  });

  it('preserves collector name, status, and itemCount', () => {
    const summary = buildSourceHealthSummary([makeCollector('success', 7, 'deribit')]);
    expect(summary.collectors).toHaveLength(1);
    expect(summary.collectors[0]).toMatchObject({ name: 'deribit', status: 'success', itemCount: 7 });
  });

  it('includes error field only when present', () => {
    const withError: CollectorDataQuality = { name: 'bea', status: 'failed', itemCount: 0, error: 'timeout' };
    const withoutError: CollectorDataQuality = { name: 'fred', status: 'success', itemCount: 2 };
    const summary = buildSourceHealthSummary([withError, withoutError]);
    expect(summary.collectors[0]).toHaveProperty('error', 'timeout');
    expect(summary.collectors[1]).not.toHaveProperty('error');
  });

  it('includes reasonCode field only when present', () => {
    const withReason: CollectorDataQuality = {
      name: 'coinmarketcap-etf',
      status: 'skipped',
      itemCount: 0,
      reasonCode: 'NO_STABLE_API',
    };
    const withoutReason: CollectorDataQuality = { name: 'bybit', status: 'success', itemCount: 2 };
    const summary = buildSourceHealthSummary([withReason, withoutReason]);
    expect(summary.collectors[0]).toHaveProperty('reasonCode', 'NO_STABLE_API');
    expect(summary.collectors[1]).not.toHaveProperty('reasonCode');
  });

  it('returns zeros when collector list is empty', () => {
    const summary = buildSourceHealthSummary([]);
    expect(summary.healthyCount).toBe(0);
    expect(summary.failedCount).toBe(0);
    expect(summary.skippedCount).toBe(0);
    expect(summary.collectors).toHaveLength(0);
  });

  it('handles partial status — not counted in healthy, failed, or skipped', () => {
    const summary = buildSourceHealthSummary([makeCollector('partial', 2, 'defillama')]);
    expect(summary.healthyCount).toBe(0);
    expect(summary.failedCount).toBe(0);
    expect(summary.skippedCount).toBe(0);
    expect(summary.collectors[0]?.status).toBe('partial');
  });

  it('preserves FRED/BoJ quota-limited statuses without counting them as failed', () => {
    const summary = buildSourceHealthSummary([
      {
        name: 'fred-rates',
        status: 'partial',
        itemCount: 2,
        reasonCode: 'ACCESS_LIMITED_QUOTA',
        error: 'FRED DGS2: 429 Too Many Requests',
      },
      {
        name: 'boj-rates',
        status: 'skipped',
        itemCount: 0,
        reasonCode: 'ACCESS_LIMITED_QUOTA',
        error: 'FRED IRSTCB01JPM156N: 429 Too Many Requests',
      },
    ]);

    expect(summary.failedCount).toBe(0);
    expect(summary.partialCount).toBe(1);
    expect(summary.skippedCount).toBe(1);
    expect(summary.collectors).toEqual([
      expect.objectContaining({
        name: 'fred-rates',
        status: 'partial',
        reasonCode: 'ACCESS_LIMITED_QUOTA',
      }),
      expect.objectContaining({
        name: 'boj-rates',
        status: 'skipped',
        reasonCode: 'ACCESS_LIMITED_QUOTA',
      }),
    ]);
  });
});
