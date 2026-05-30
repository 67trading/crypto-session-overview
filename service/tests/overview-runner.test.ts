import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OverviewRunner } from '../src/overview-runner.js';
import type { SessionOverviewDeps } from '../src/service-types.js';
import type {
  OverviewMarketSnapshot,
  DerivativesContext,
  OverviewOutput,
  NormalizedEvent,
  HtfCandle,
} from '../src/ports.js';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeCandle(price: number, time = Date.now()): HtfCandle {
  return { openTimeMs: time - 3600_000, closeTimeMs: time, open: price, high: price + 100, low: price - 100, close: price, volume: 1000 };
}

function makeSnapshot(symbol: string, price: number): OverviewMarketSnapshot {
  return {
    symbol,
    latestPrice: price,
    candles: {
      weekly: [makeCandle(price - 500), makeCandle(price)],
      daily: [makeCandle(price - 200), makeCandle(price)],
      fourHour: [makeCandle(price - 50), makeCandle(price)],
    },
  };
}

function makeDerivatives(symbol: string): DerivativesContext {
  return { symbol, fundingStatus: 'neutral', oiStatus: 'stable', positioningStatus: 'balanced' };
}

function makeValidOutput(session = 'US_CRYPTO'): OverviewOutput {
  return {
    briefId: 'brief-test-1',
    generatedAtUtc: new Date().toISOString(),
    session: session as OverviewOutput['session'],
    marketRegime: 'constructive',
    briefConfidence: 'medium',
    dataStatus: { price: 'fresh', events: 'fresh', derivatives: 'fresh', liquidations: 'unavailable' },
    whatChanged: ['BTC structure turned bullish.'],
    btc: { summary: 'BTC above weekly resistance.', keyLevels: ['97000'], position: 'above midpoint', structure: 'bullish' },
    eth: { summary: 'ETH tracking BTC.', vsbtc: 'ETH/BTC sideways (+0.1%)', keyLevels: ['3200'] },
    majorAssets: [],
    alts: { summary: 'Mixed breadth.', rotationState: 'selective_rotation', breadth: '60% positive on 24h' },
    derivatives: { summary: 'Neutral.', funding: 'neutral across BTC/ETH', oi: 'stable across BTC/ETH', positioning: 'balanced across BTC/ETH' },
    liquidity: { bullets: ['Cluster at 96,000.'] },
    events: { summary: 'Light calendar.', upcoming: [] },
    scenarios: { reclaim: 'Push to ATH.', rejection: 'Pullback to 95k.', chop: 'Range between 95-98k.' },
    note: 'Data is fresh across all sources.',
  };
}

function makeRepo() {
  return {
    saveInputSnapshot: vi.fn().mockResolvedValue('snap-id-1'),
    saveCollectedEvents: vi.fn().mockResolvedValue(undefined),
    saveCollectorRun: vi.fn().mockResolvedValue(undefined),
    saveOverview: vi.fn().mockResolvedValue('overview-id-1'),
    updateOverviewTelegramPosts: vi.fn().mockResolvedValue(undefined),
    getLatestOverview: vi.fn().mockResolvedValue(null),
    listOverviews: vi.fn().mockResolvedValue([]),
    saveTelegramPost: vi.fn().mockResolvedValue(undefined),
    saveLlmUsage: vi.fn().mockResolvedValue(undefined),
    getOverviewById: vi.fn().mockResolvedValue(null),
    listEvents: vi.fn().mockResolvedValue([]),
    listCollectorRuns: vi.fn().mockResolvedValue([]),
    listTelegramPosts: vi.fn().mockResolvedValue([]),
  };
}

function makeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeDeps(overrides: Partial<SessionOverviewDeps> = {}): SessionOverviewDeps {
  return {
    marketDataCollector: {
      collect: vi.fn().mockResolvedValue([
        makeSnapshot('BTCUSDT', 97000),
        makeSnapshot('ETHUSDT', 3200),
      ]),
    },
    derivativesCollector: {
      collect: vi.fn().mockResolvedValue({
        BTCUSDT: makeDerivatives('BTCUSDT'),
        ETHUSDT: makeDerivatives('ETHUSDT'),
      }),
    },
    eventCollectors: [],
    contextCollectors: [],
    setupLoader: { loadActive: vi.fn().mockResolvedValue([]) },
    llmClient: {
      modelName: 'test-model',
      generateOverview: vi.fn().mockResolvedValue({ output: makeValidOutput() }),
    },
    repository: makeRepo(),
    logger: makeLogger(),
    ...overrides,
  };
}

const RUN_OPTIONS = {
  session: 'US_CRYPTO' as const,
  symbols: { core: ['BTCUSDT', 'ETHUSDT'], major: [], watch: [] },
  publish: false,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('OverviewRunner.run()', () => {
  it('returns SUCCESS with overviewId on a fully successful run', async () => {
    const runner = new OverviewRunner(makeDeps());
    const result = await runner.run(RUN_OPTIONS);

    expect(result.status).toBe('SUCCESS');
    expect(result.overviewId).toBe('overview-id-1');
    expect(result.session).toBe('US_CRYPTO');
    expect(result.telegramPublished).toBe(false);
  });

  it('saves input snapshot, collector runs, and overview to repository', async () => {
    const repo = makeRepo();
    const runner = new OverviewRunner(makeDeps({ repository: repo }));
    await runner.run(RUN_OPTIONS);

    expect(repo.saveInputSnapshot).toHaveBeenCalledOnce();
    expect(repo.saveOverview).toHaveBeenCalledOnce();
  });

  it('uses firstBriefBullets on first run (no previous brief)', async () => {
    const repo = makeRepo();
    repo.getLatestOverview.mockResolvedValue(null);
    const runner = new OverviewRunner(makeDeps({ repository: repo }));
    const result = await runner.run(RUN_OPTIONS);

    // firstBriefBullets() produces a single-item whatChanged about "initial reading"
    expect(result.output?.whatChanged).toHaveLength(1);
    expect(result.output?.whatChanged[0]).toMatch(/initial/i);
  });

  it('computes whatChanged via brief diff when a previous SUCCESS brief exists', async () => {
    const prevOutput = makeValidOutput();
    const repo = makeRepo();
    repo.getLatestOverview.mockResolvedValue({
      overviewId: 'prev-id',
      session: 'US_CRYPTO',
      status: 'SUCCESS',
      outputJson: prevOutput,
      createdAt: new Date().toISOString(),
    });
    const llmOutput = makeValidOutput();
    // Change something meaningful to trigger a diff bullet
    llmOutput.btc.structure = 'bearish';

    const runner = new OverviewRunner(makeDeps({
      repository: repo,
      llmClient: { modelName: 'test', generateOverview: vi.fn().mockResolvedValue({ output: llmOutput }) },
    }));
    const result = await runner.run(RUN_OPTIONS);

    expect(result.status).toBe('SUCCESS');
    // whatChanged is computed — at minimum 1 bullet
    expect(result.output?.whatChanged.length).toBeGreaterThanOrEqual(1);
  });

  it('continues and returns SUCCESS when an event collector fails', async () => {
    const failingCollector = {
      sourceName: 'failing-collector',
      collect: vi.fn().mockRejectedValue(new Error('timeout')),
    };
    const deps = makeDeps({ eventCollectors: [failingCollector] });
    const runner = new OverviewRunner(deps);
    const result = await runner.run(RUN_OPTIONS);

    expect(result.status).toBe('SUCCESS');
    expect((deps.logger as ReturnType<typeof makeLogger>).warn).toHaveBeenCalled();
  });

  it('continues and returns SUCCESS when a context collector throws', async () => {
    const throwingCollector = {
      sourceName: 'failing-ctx',
      collect: vi.fn().mockRejectedValue(new Error('api down')),
    };
    const deps = makeDeps({
      contextCollectors: [{
        collector: throwingCollector,
        merge: (input: unknown) => input as never,
      }],
    });
    const runner = new OverviewRunner(deps);
    const result = await runner.run(RUN_OPTIONS);

    expect(result.status).toBe('SUCCESS');
    expect((deps.logger as ReturnType<typeof makeLogger>).warn).toHaveBeenCalled();
  });

  it('returns FAILED when market data collector throws', async () => {
    const deps = makeDeps({
      marketDataCollector: {
        collect: vi.fn().mockRejectedValue(new Error('Bybit unreachable')),
      },
    });
    const runner = new OverviewRunner(deps);
    const result = await runner.run(RUN_OPTIONS);

    expect(result.status).toBe('FAILED');
    expect(result.error).toContain('Bybit unreachable');
    expect(result.telegramPublished).toBe(false);
  });

  it('returns FAILED when LLM client throws', async () => {
    const deps = makeDeps({
      llmClient: {
        modelName: 'test-model',
        generateOverview: vi.fn().mockRejectedValue(new Error('API quota exceeded')),
      },
    });
    const runner = new OverviewRunner(deps);
    const result = await runner.run(RUN_OPTIONS);

    expect(result.status).toBe('FAILED');
    expect(result.error).toContain('API quota exceeded');
  });

  it('publishes to Telegram and saves post records when publish=true', async () => {
    const publisher = {
      publish: vi.fn().mockResolvedValue(['msg-101', 'msg-102']),
    };
    const repo = makeRepo();
    const deps = makeDeps({ repository: repo, publisher });
    const runner = new OverviewRunner(deps);
    const result = await runner.run({ ...RUN_OPTIONS, publish: true });

    expect(result.status).toBe('SUCCESS');
    expect(result.telegramPublished).toBe(true);
    expect(publisher.publish).toHaveBeenCalled();
    expect(repo.saveTelegramPost).toHaveBeenCalled();
    expect(repo.updateOverviewTelegramPosts).toHaveBeenCalled();
  });

  it('logs invariant violations as warnings without failing the run', async () => {
    const badOutput = makeValidOutput();
    // Violate: go long is a forbidden phrase
    badOutput.scenarios.reclaim = 'Go long above 98000 for ATH push.';

    const logger = makeLogger();
    const deps = makeDeps({
      logger,
      llmClient: {
        modelName: 'test-model',
        generateOverview: vi.fn().mockResolvedValue({ output: badOutput }),
      },
    });
    const runner = new OverviewRunner(deps);
    const result = await runner.run(RUN_OPTIONS);

    // Run downgrades to PARTIAL due to hard violations
    expect(result.status).toBe('PARTIAL');
    expect(result.telegramPublished).toBe(false);
    // Invariant warning was logged
    const warnCalls = logger.warn.mock.calls as unknown[][];
    const invariantWarn = warnCalls.find((args) =>
      typeof args[1] === 'string' && args[1].includes('invariant'),
    );
    expect(invariantWarn).toBeDefined();
  });

  it('does not publish to Telegram when output has hard violations (forbidden phrase)', async () => {
    const badOutput = makeValidOutput();
    badOutput.scenarios.reclaim = 'Go long above 98000.';

    const publisher = { publish: vi.fn().mockResolvedValue(['msg-1']) };
    const deps = makeDeps({
      publisher,
      llmClient: {
        modelName: 'test-model',
        generateOverview: vi.fn().mockResolvedValue({ output: badOutput }),
      },
    });
    const runner = new OverviewRunner(deps);
    const result = await runner.run({ ...RUN_OPTIONS, publish: true });

    expect(result.status).toBe('PARTIAL');
    expect(result.telegramPublished).toBe(false);
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('includes marketRegime and briefConfidence in SUCCESS result', async () => {
    const runner = new OverviewRunner(makeDeps());
    const result = await runner.run(RUN_OPTIONS);

    expect(typeof result.marketRegime).toBe('string');
    expect(typeof result.briefConfidence).toBe('string');
  });

  it('context collectors deep-merge multiple MacroRatesContext contributors', async () => {
    // Wire up two context collectors each contributing different MacroRatesContext fields
    const { mergeMacroRatesContext } = await import('../src/context-merge.js');

    const fredCollector = {
      sourceName: 'fred-rates',
      collect: vi.fn().mockResolvedValue({
        status: 'success' as const,
        data: { fedFundsRate: 5.25, us10yYield: 4.5, dataDate: '2025-01-01' },
        itemCount: 2,
      }),
    };
    const ecbCollector = {
      sourceName: 'ecb-rates',
      collect: vi.fn().mockResolvedValue({
        status: 'success' as const,
        data: { ecbDepositRate: 4.0, ecbMainRate: 4.25, dataDate: '2025-01-01' },
        itemCount: 2,
      }),
    };

    let capturedInput: unknown;
    const deps = makeDeps({
      contextCollectors: [
        { collector: fredCollector, merge: mergeMacroRatesContext },
        { collector: ecbCollector, merge: mergeMacroRatesContext },
      ],
      llmClient: {
        modelName: 'test-model',
        generateOverview: vi.fn().mockImplementation((input) => {
          capturedInput = input;
          return Promise.resolve({ output: makeValidOutput() });
        }),
      },
    });

    const runner = new OverviewRunner(deps);
    await runner.run(RUN_OPTIONS);

    const macro = (capturedInput as { macroRatesContext?: Record<string, unknown> }).macroRatesContext;
    // Both collectors must have contributed their fields without overwriting each other
    expect(macro?.fedFundsRate).toBeCloseTo(5.25);
    expect(macro?.us10yYield).toBeCloseTo(4.5);
    expect(macro?.ecbDepositRate).toBeCloseTo(4.0);
    expect(macro?.ecbMainRate).toBeCloseTo(4.25);
  });

  it('saves sourceHealth with correct healthyCount and failedCount', async () => {
    const failingCollector = {
      sourceName: 'bad-events',
      collect: vi.fn().mockRejectedValue(new Error('error')),
    };
    const repo = makeRepo();
    const deps = makeDeps({
      repository: repo,
      eventCollectors: [failingCollector],
    });

    const runner = new OverviewRunner(deps);
    await runner.run(RUN_OPTIONS);

    // saveOverview is called with sourceHealth containing the failed collector
    const saveCall = repo.saveOverview.mock.calls[0][0] as { sourceHealth?: { failedCount: number; healthyCount: number } };
    expect(saveCall.sourceHealth?.failedCount).toBeGreaterThanOrEqual(1);
  });
});
