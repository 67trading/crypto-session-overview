import { describe, it, expect } from 'vitest';
import {
  mergeLiquidityContext,
  mergeEtfFlowContext,
  mergeOptionsContext,
  mergeMacroRatesContext,
  mergeBreadthContext,
  contextCollectorEntry,
} from '../src/context-merge.js';
import type {
  OverviewInput,
  CollectorResult,
  LiquidityContext,
  EtfFlowContext,
  OptionsContext,
  MacroRatesContext,
  AltsBreadthSummary,
  ContextCollector,
  CollectorRunContext,
} from '../src/ports.js';

function makeBaseInput(): OverviewInput {
  return {
    request: {
      session: 'US_CRYPTO',
      createdAt: '2024-01-01T00:00:00Z',
      timezone: 'UTC',
      allowedTimeframes: ['Weekly', 'Daily', '4H', 'Session'],
      forbiddenTimeframes: ['1H', '15m', '5m'],
    },
    universe: { coreSymbols: ['BTCUSDT'], majorSymbols: [], watchSymbols: [] },
    marketContext: { btcTone: 'constructive', ethVsBtc: 'in_line' },
    levels: {},
    sessionContext: null,
    derivativesContext: {},
    eventsForSession: [],
    activeSetups: [],
    dataQuality: { collectors: [], missingSources: [], failedSources: [] },
  };
}

function makeResult<T>(status: CollectorResult<T>['status'], data?: T): CollectorResult<T> {
  return { status, itemCount: data !== undefined ? 1 : 0, ...(data !== undefined ? { data } : {}) };
}

describe('mergeLiquidityContext()', () => {
  it('sets liquidityContext when status is success and data is present', () => {
    const data: LiquidityContext = { clusters: [{ price: 60000, side: 'long', estimatedSizeUsd: 1_000_000 }] };
    const result = mergeLiquidityContext(makeBaseInput(), makeResult('success', data));
    expect(result.liquidityContext).toEqual(data);
  });

  it('leaves input unchanged when data is undefined (failed/skipped)', () => {
    const input = makeBaseInput();
    const result = mergeLiquidityContext(input, makeResult('failed'));
    expect(result.liquidityContext).toBeUndefined();
    expect(result).toEqual(input);
  });

  it('returns a new object, not the same reference', () => {
    const data: LiquidityContext = { clusters: [] };
    const input = makeBaseInput();
    const result = mergeLiquidityContext(input, makeResult('success', data));
    expect(result).not.toBe(input);
  });
});

describe('mergeEtfFlowContext()', () => {
  it('sets etfFlowContext when data is present', () => {
    const data: EtfFlowContext = { btcFlowUsd: 100_000_000, date: '2024-01-01', source: 'farside' };
    const result = mergeEtfFlowContext(makeBaseInput(), makeResult('success', data));
    expect(result.etfFlowContext).toEqual(data);
  });

  it('leaves input unchanged when data is undefined', () => {
    const result = mergeEtfFlowContext(makeBaseInput(), makeResult('skipped'));
    expect(result.etfFlowContext).toBeUndefined();
  });
});

describe('mergeOptionsContext()', () => {
  it('sets optionsContext array when data is present', () => {
    const data: OptionsContext[] = [{ symbol: 'BTCUSDT', putCallRatio: 0.8 }];
    const result = mergeOptionsContext(makeBaseInput(), makeResult('success', data));
    expect(result.optionsContext).toEqual(data);
  });

  it('leaves input unchanged when data is undefined', () => {
    const result = mergeOptionsContext(makeBaseInput(), makeResult('partial'));
    expect(result.optionsContext).toBeUndefined();
  });
});

describe('mergeMacroRatesContext()', () => {
  it('sets macroRatesContext when data is present', () => {
    const data: MacroRatesContext = { fedFundsRate: 5.25, us10yYield: 4.5 };
    const result = mergeMacroRatesContext(makeBaseInput(), makeResult('success', data));
    expect(result.macroRatesContext).toEqual(data);
  });

  it('leaves input unchanged when data is undefined', () => {
    const result = mergeMacroRatesContext(makeBaseInput(), makeResult('failed'));
    expect(result.macroRatesContext).toBeUndefined();
  });
});

describe('mergeBreadthContext()', () => {
  const breadthData: AltsBreadthSummary = {
    breadthPercent: 65,
    positiveCount: 65,
    totalTracked: 100,
    breadthLabel: 'moderate breadth',
    rotationState: 'selective_rotation',
  };

  it('sets altsBreadth when data is present', () => {
    const result = mergeBreadthContext(makeBaseInput(), makeResult('success', breadthData));
    expect(result.altsBreadth).toEqual(breadthData);
  });

  it('returns input unchanged when data is undefined', () => {
    const input = makeBaseInput();
    const result = mergeBreadthContext(input, makeResult('partial'));
    expect(result.altsBreadth).toBeUndefined();
    expect(result).toBe(input);
  });

  it('returns a new object, not the same reference', () => {
    const input = makeBaseInput();
    const result = mergeBreadthContext(input, makeResult('success', breadthData));
    expect(result).not.toBe(input);
  });
});

describe('contextCollectorEntry()', () => {
  it('produces an entry whose merge delegates to the typed merge function', async () => {
    const data: LiquidityContext = { clusters: [] };
    const mockCollector: ContextCollector<LiquidityContext> = {
      sourceName: 'mock-liq',
      async collect(_ctx: CollectorRunContext) {
        return { status: 'success', data, itemCount: 0 };
      },
    };
    const entry = contextCollectorEntry(mockCollector, mergeLiquidityContext);
    const input = makeBaseInput();
    const result = await entry.collector.collect({} as CollectorRunContext);
    const merged = entry.merge(input, result);
    expect(merged.liquidityContext).toEqual(data);
  });

  it('erases generic to unknown — entry can be stored in a plain array', () => {
    const mockCollector: ContextCollector<EtfFlowContext> = {
      sourceName: 'mock-etf',
      async collect(_ctx: CollectorRunContext) {
        return { status: 'skipped', itemCount: 0 };
      },
    };
    const entries: { collector: ContextCollector<unknown>; merge: (i: OverviewInput, r: CollectorResult<unknown>) => OverviewInput }[] = [];
    entries.push(contextCollectorEntry(mockCollector, mergeEtfFlowContext));
    expect(entries).toHaveLength(1);
    expect(entries[0]?.collector.sourceName).toBe('mock-etf');
  });
});
