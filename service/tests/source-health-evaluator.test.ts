import { describe, it, expect } from 'vitest';
import { computeDataStatus } from '../src/source-health-evaluator.js';
import type { CollectorDataQuality } from '../src/ports.js';

function makeCollector(
  status: 'success' | 'partial' | 'failed',
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

    it('is partial when all collectors succeed but return 0 items', () => {
      const collectors = [
        makeCollector('success', 0, 'bybit'),
        makeCollector('success', 0, 'fed-calendar'),
      ];
      const result = computeDataStatus({ priceOk: true, derivativesOk: true, eventCollectors: collectors });
      expect(result.events).toBe('partial');
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

    it('distinguishes 0-items-succeeded (partial) from error-failed (failed vs partial)', () => {
      // One zero-items, no errors → partial (not failed)
      const zeroItems = [makeCollector('success', 0)];
      const failResult = computeDataStatus({ priceOk: true, derivativesOk: true, eventCollectors: zeroItems });
      expect(failResult.events).toBe('partial');

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
