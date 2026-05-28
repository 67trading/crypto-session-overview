import { describe, it, expect } from 'vitest';
import { classifyMarketRegime } from '../src/market-regime-classifier.js';
import type { RegimeClassifierInput } from '../src/market-regime-classifier.js';

function makeInput(overrides: Partial<RegimeClassifierInput> = {}): RegimeClassifierInput {
  return {
    btcTone: 'neutral',
    btcFourHourStructure: 'range',
    btcWeeklyPosition: 'at_midpoint',
    btcDailyPosition: 'at_midpoint',
    btcFunding: 'neutral',
    btcOiStatus: 'stable',
    btcPositioning: 'balanced',
    hasCriticalEvents: false,
    dataStatus: { price: 'fresh', events: 'fresh', derivatives: 'fresh', liquidations: 'unavailable' },
    ...overrides,
  };
}

describe('classifyMarketRegime()', () => {
  describe('regime classification', () => {
    it('risk_on_expansion: bullish breakout with balanced positioning', () => {
      const result = classifyMarketRegime(makeInput({ btcTone: 'bullish_breakout', btcPositioning: 'balanced' }));
      expect(result.marketRegime).toBe('risk_on_expansion');
    });

    it('long_heavy_near_resistance: bullish breakout with long-heavy positioning', () => {
      const result = classifyMarketRegime(makeInput({ btcTone: 'bullish_breakout', btcPositioning: 'long_heavy' }));
      expect(result.marketRegime).toBe('long_heavy_near_resistance');
    });

    it('long_heavy_near_resistance: bullish breakout with positive extreme funding', () => {
      const result = classifyMarketRegime(makeInput({ btcTone: 'bullish_breakout', btcFunding: 'positive_extreme' }));
      expect(result.marketRegime).toBe('long_heavy_near_resistance');
    });

    it('risk_off: bearish breakdown with short-heavy positioning', () => {
      const result = classifyMarketRegime(makeInput({ btcTone: 'bearish_breakdown', btcPositioning: 'short_heavy' }));
      expect(result.marketRegime).toBe('risk_off');
    });

    it('risk_off: bearish breakdown with negative extreme funding', () => {
      const result = classifyMarketRegime(makeInput({ btcTone: 'bearish_breakdown', btcFunding: 'negative_extreme' }));
      expect(result.marketRegime).toBe('risk_off');
    });

    it('short_heavy_near_support: bearish breakdown with balanced positioning', () => {
      const result = classifyMarketRegime(makeInput({ btcTone: 'bearish_breakdown', btcPositioning: 'balanced' }));
      expect(result.marketRegime).toBe('short_heavy_near_support');
    });

    it('constructive_but_extended: constructive tone with elevated positioning', () => {
      const result = classifyMarketRegime(makeInput({
        btcTone: 'constructive',
        btcFourHourStructure: 'bullish',
        btcPositioning: 'balanced',
        btcFunding: 'positive_elevated',
      }));
      expect(result.marketRegime).toBe('constructive_but_extended');
    });

    it('long_heavy_near_resistance: constructive tone, long-heavy, above weekly midpoint', () => {
      const result = classifyMarketRegime(makeInput({
        btcTone: 'constructive',
        btcPositioning: 'long_heavy',
        btcWeeklyPosition: 'above_midpoint',
      }));
      expect(result.marketRegime).toBe('long_heavy_near_resistance');
    });

    it('constructive_but_extended: constructive tone, long-heavy, below weekly midpoint', () => {
      const result = classifyMarketRegime(makeInput({
        btcTone: 'constructive',
        btcFourHourStructure: 'bullish',
        btcPositioning: 'long_heavy',
        btcWeeklyPosition: 'below_midpoint',
      }));
      expect(result.marketRegime).toBe('constructive_but_extended');
    });

    it('short_heavy_near_support: weak tone with short-heavy positioning', () => {
      const result = classifyMarketRegime(makeInput({ btcTone: 'weak', btcPositioning: 'short_heavy' }));
      expect(result.marketRegime).toBe('short_heavy_near_support');
    });

    it('defensive_range_bound: weak tone with balanced positioning', () => {
      const result = classifyMarketRegime(makeInput({ btcTone: 'weak', btcPositioning: 'balanced' }));
      expect(result.marketRegime).toBe('defensive_range_bound');
    });

    it('defensive_range_bound: range structure with neutral conditions', () => {
      const result = classifyMarketRegime(makeInput({
        btcTone: 'neutral',
        btcFourHourStructure: 'range',
        btcFunding: 'neutral',
        btcPositioning: 'balanced',
        btcOiStatus: 'stable',
      }));
      expect(result.marketRegime).toBe('defensive_range_bound');
    });

    it('range_compression: range structure, neutral funding, falling OI', () => {
      const result = classifyMarketRegime(makeInput({
        btcFourHourStructure: 'range',
        btcFunding: 'neutral',
        btcPositioning: 'balanced',
        btcOiStatus: 'falling',
      }));
      expect(result.marketRegime).toBe('range_compression');
    });

    it('mixed: transition structure with neutral tone', () => {
      const result = classifyMarketRegime(makeInput({ btcFourHourStructure: 'transition', btcTone: 'neutral' }));
      expect(result.marketRegime).toBe('mixed');
    });

    it('event_driven: neutral tone with critical events', () => {
      const result = classifyMarketRegime(makeInput({ btcTone: 'neutral', hasCriticalEvents: true, btcFourHourStructure: 'unknown' }));
      expect(result.marketRegime).toBe('event_driven');
    });

    it('unknown: all signals are unknown', () => {
      const result = classifyMarketRegime(makeInput({
        btcTone: 'unknown',
        btcFourHourStructure: 'unknown',
        btcFunding: 'unknown',
        btcPositioning: 'unknown',
        btcWeeklyPosition: null,
        btcDailyPosition: null,
      }));
      expect(result.marketRegime).toBe('unknown');
    });
  });

  describe('confidence classification', () => {
    it('high confidence: clean signals, fresh data', () => {
      const result = classifyMarketRegime(makeInput({
        btcTone: 'bullish_breakout',
        btcFourHourStructure: 'bullish',
        btcFunding: 'positive_elevated',
        btcPositioning: 'balanced',
      }));
      expect(result.briefConfidence).toBe('high');
    });

    it('medium confidence: unknown funding signal', () => {
      const result = classifyMarketRegime(makeInput({
        btcTone: 'constructive',
        btcFourHourStructure: 'bullish',
        btcFunding: 'unknown',
        btcPositioning: 'unknown',
      }));
      expect(result.briefConfidence).toBe('medium');
    });

    it('low confidence: price data failed', () => {
      const result = classifyMarketRegime(makeInput({
        dataStatus: { price: 'failed', events: 'fresh', derivatives: 'fresh', liquidations: 'unavailable' },
      }));
      expect(result.briefConfidence).toBe('low');
    });

    it('low confidence: derivatives failed + unknown structure', () => {
      const result = classifyMarketRegime(makeInput({
        dataStatus: { price: 'fresh', events: 'fresh', derivatives: 'failed', liquidations: 'unavailable' },
        btcFourHourStructure: 'unknown',
        btcFunding: 'unknown',
      }));
      expect(result.briefConfidence).toBe('low');
    });

    it('medium confidence: transition structure (inherently uncertain)', () => {
      const result = classifyMarketRegime(makeInput({
        btcFourHourStructure: 'transition',
        btcFunding: 'neutral',
        btcPositioning: 'balanced',
      }));
      expect(result.briefConfidence).toBe('medium');
    });

    it('low confidence: conflicting signals (constructive tone + negative extreme funding)', () => {
      const result = classifyMarketRegime(makeInput({
        btcTone: 'constructive',
        btcFunding: 'negative_extreme',
        btcFourHourStructure: 'unknown',
        btcPositioning: 'unknown',
      }));
      expect(result.briefConfidence).toBe('low');
    });
  });

  describe('output shape', () => {
    it('always returns both marketRegime and briefConfidence', () => {
      const result = classifyMarketRegime(makeInput());
      expect(result).toHaveProperty('marketRegime');
      expect(result).toHaveProperty('briefConfidence');
    });
  });
});
