import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OverviewRunner } from '../src/overview-runner.js';
import { PRODUCT_FOOTER_NOTE } from '../src/presentation-contract.js';
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
    marketRegime: 'constructive_but_extended',
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
    note: 'LLM-provided note should be overridden.',
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
    getOverviewByRunKey: vi.fn().mockResolvedValue(null),
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
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
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

  it('returns an existing overview for the same session window unless force=true', async () => {
    const existing = {
      id: 'existing-overview',
      session: 'US_CRYPTO' as const,
      status: 'SUCCESS' as const,
      outputJson: makeValidOutput(),
      telegramPostIds: ['msg-1'],
    };
    const repo = makeRepo();
    repo.getOverviewByRunKey.mockResolvedValue(existing);
    const marketDataCollector = { collect: vi.fn().mockResolvedValue([makeSnapshot('BTCUSDT', 97000)]) };
    const deps = makeDeps({ repository: repo, marketDataCollector });
    const runner = new OverviewRunner(deps);

    const result = await runner.run(RUN_OPTIONS);

    expect(result.overviewId).toBe('existing-overview');
    expect(result.telegramPublished).toBe(true);
    expect(marketDataCollector.collect).not.toHaveBeenCalled();
  });

  it('retries once with a deterministic retry key when the base overview is FAILED', async () => {
    const existing = {
      id: 'failed-overview',
      session: 'US_CRYPTO' as const,
      status: 'FAILED' as const,
      outputJson: makeValidOutput(),
    };
    const repo = makeRepo();
    repo.getOverviewByRunKey
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(null);
    const marketDataCollector = {
      collect: vi.fn().mockResolvedValue([
        makeSnapshot('BTCUSDT', 97000),
        makeSnapshot('ETHUSDT', 3200),
      ]),
    };
    const deps = makeDeps({ repository: repo, marketDataCollector });
    const runner = new OverviewRunner(deps);

    const result = await runner.run(RUN_OPTIONS);

    expect(result.status).toBe('SUCCESS');
    expect(result.overviewId).toBe('overview-id-1');
    expect(marketDataCollector.collect).toHaveBeenCalled();
    expect(repo.saveOverview).toHaveBeenCalledWith(expect.objectContaining({
      runKey: expect.stringMatching(/:retry$/),
    }));
  });

  it('returns an existing retry overview after a base FAILED overview', async () => {
    const failedBase = {
      id: 'failed-overview',
      session: 'US_CRYPTO' as const,
      status: 'FAILED' as const,
      outputJson: makeValidOutput(),
    };
    const retryOverview = {
      id: 'retry-overview',
      session: 'US_CRYPTO' as const,
      status: 'SUCCESS' as const,
      outputJson: makeValidOutput(),
    };
    const repo = makeRepo();
    repo.getOverviewByRunKey
      .mockResolvedValueOnce(failedBase)
      .mockResolvedValueOnce(retryOverview);
    const marketDataCollector = {
      collect: vi.fn().mockResolvedValue([makeSnapshot('BTCUSDT', 97000)]),
    };
    const deps = makeDeps({ repository: repo, marketDataCollector });
    const runner = new OverviewRunner(deps);

    const result = await runner.run(RUN_OPTIONS);

    expect(result.overviewId).toBe('retry-overview');
    expect(result.status).toBe('SUCCESS');
    expect(marketDataCollector.collect).not.toHaveBeenCalled();
  });

  it('retries once with a deterministic retry key when the base overview is PARTIAL', async () => {
    const existing = {
      id: 'partial-overview',
      session: 'US_CRYPTO' as const,
      status: 'PARTIAL' as const,
      outputJson: makeValidOutput(),
    };
    const repo = makeRepo();
    repo.getOverviewByRunKey
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(null);
    const marketDataCollector = {
      collect: vi.fn().mockResolvedValue([
        makeSnapshot('BTCUSDT', 97000),
        makeSnapshot('ETHUSDT', 3200),
      ]),
    };
    const deps = makeDeps({ repository: repo, marketDataCollector });
    const runner = new OverviewRunner(deps);

    const result = await runner.run(RUN_OPTIONS);

    expect(result.status).toBe('SUCCESS');
    expect(marketDataCollector.collect).toHaveBeenCalled();
    expect(repo.saveOverview).toHaveBeenCalledWith(expect.objectContaining({
      runKey: expect.stringMatching(/:retry$/),
    }));
  });

  it('returns the concurrently saved overview when saveOverview hits a runKey unique conflict', async () => {
    const concurrentOverview = {
      id: 'concurrent-overview',
      session: 'US_CRYPTO' as const,
      status: 'SUCCESS' as const,
      outputJson: makeValidOutput(),
    };
    const uniqueError = Object.assign(new Error('Unique constraint failed on the fields: (`runKey`)'), {
      code: 'P2002',
      meta: { target: ['runKey'] },
    });
    const repo = makeRepo();
    repo.getOverviewByRunKey
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(concurrentOverview);
    repo.saveOverview.mockRejectedValue(uniqueError);
    const runner = new OverviewRunner(makeDeps({ repository: repo }));

    const result = await runner.run(RUN_OPTIONS);

    expect(result.overviewId).toBe('concurrent-overview');
    expect(result.status).toBe('SUCCESS');
  });

  it('saves input snapshot, collector runs, and overview to repository', async () => {
    const repo = makeRepo();
    const runner = new OverviewRunner(makeDeps({ repository: repo }));
    await runner.run(RUN_OPTIONS);

    expect(repo.saveInputSnapshot).toHaveBeenCalledOnce();
    expect(repo.saveOverview).toHaveBeenCalledOnce();
  });

  it('records successful market-data and derivatives collector runs with source telemetry', async () => {
    const repo = makeRepo();
    const runner = new OverviewRunner(makeDeps({ repository: repo }));
    await runner.run(RUN_OPTIONS);

    expect(repo.saveCollectorRun).toHaveBeenCalledWith(expect.objectContaining({
      collectorName: 'market-data',
      status: 'SUCCESS',
      source: 'market-data',
      itemCount: 2,
      durationMs: expect.any(Number),
    }));
    expect(repo.saveCollectorRun).toHaveBeenCalledWith(expect.objectContaining({
      collectorName: 'derivatives',
      status: 'SUCCESS',
      source: 'derivatives',
      itemCount: 2,
      durationMs: expect.any(Number),
    }));
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

  it('overrides the LLM note with the exact product footer', async () => {
    const runner = new OverviewRunner(makeDeps());
    const result = await runner.run(RUN_OPTIONS);

    expect(result.output?.note).toBe(PRODUCT_FOOTER_NOTE);
    expect(result.humanReport).toContain('Context only. No entries/exits/sizing/leverage.');
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

  it('sends a bounded previous brief context to the LLM input', async () => {
    const longText = 'Verbose previous session context with repeated details. '.repeat(20);
    const prevOutput = makeValidOutput();
    prevOutput.btc.summary = longText;
    prevOutput.btc.position = longText;
    prevOutput.eth.vsbtc = longText;
    prevOutput.alts.breadth = longText;
    prevOutput.derivatives.funding = longText;
    prevOutput.derivatives.oi = longText;
    prevOutput.derivatives.positioning = longText;
    prevOutput.events.upcoming = Array.from({ length: 10 }, (_, i) => ({
      title: `${i + 1}. ${longText}`,
      time: '12:00 UTC',
      importance: 'high' as const,
    }));
    const repo = makeRepo();
    repo.listOverviews.mockResolvedValue([
      {
        id: 'failed-id',
        session: 'US_CRYPTO',
        status: 'FAILED',
        outputJson: makeValidOutput(),
      },
      {
        id: 'prev-id',
        session: 'US_CRYPTO',
        status: 'SUCCESS',
        outputJson: prevOutput,
      },
    ]);
    const runner = new OverviewRunner(makeDeps({ repository: repo }));

    await runner.run(RUN_OPTIONS);

    const savedInput = repo.saveInputSnapshot.mock.calls[0]?.[1];
    expect(savedInput.previousBrief).toEqual(expect.objectContaining({
      btcSummary: expect.stringMatching(/\.\.\.$/),
      btcPosition: expect.stringMatching(/\.\.\.$/),
      ethVsbtc: expect.stringMatching(/\.\.\.$/),
    }));
    expect(savedInput.previousBrief?.btcSummary.length).toBeLessThanOrEqual(160);
    expect(savedInput.previousBrief?.upcomingEventTitles).toHaveLength(5);
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
    expect((deps.logger as unknown as ReturnType<typeof makeLogger>).warn).toHaveBeenCalled();
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
    expect((deps.logger as unknown as ReturnType<typeof makeLogger>).warn).toHaveBeenCalled();
  });

  it('returns FAILED when market data collector throws', async () => {
    const repo = makeRepo();
    const deps = makeDeps({
      repository: repo,
      marketDataCollector: {
        collect: vi.fn().mockRejectedValue(new Error('Bybit unreachable')),
      },
    });
    const runner = new OverviewRunner(deps);
    const result = await runner.run(RUN_OPTIONS);

    expect(result.status).toBe('FAILED');
    expect(result.error).toContain('Bybit unreachable');
    expect(result.telegramPublished).toBe(false);
    expect(repo.saveCollectorRun).toHaveBeenCalledWith(expect.objectContaining({
      collectorName: 'market-data',
      status: 'FAILED',
    }));
  });

  it('returns PARTIAL and records derivatives failure when derivatives collector throws', async () => {
    const repo = makeRepo();
    const deps = makeDeps({
      repository: repo,
      derivativesCollector: {
        collect: vi.fn().mockRejectedValue(new Error('Derivatives unavailable')),
      },
    });
    const runner = new OverviewRunner(deps);
    const result = await runner.run(RUN_OPTIONS);

    expect(result.status).toBe('PARTIAL');
    expect(result.collectorStatus?.['market-data']).toBe('success');
    expect(result.collectorStatus?.['derivatives']).toBe('failed');
    expect(repo.saveCollectorRun).toHaveBeenCalledWith(expect.objectContaining({
      collectorName: 'derivatives',
      status: 'FAILED',
    }));
  });

  it('does not publish Telegram when derivatives failure makes the run PARTIAL', async () => {
    const publisher = { publish: vi.fn().mockResolvedValue(['msg-1']) };
    const deps = makeDeps({
      publisher,
      derivativesCollector: {
        collect: vi.fn().mockRejectedValue(new Error('Derivatives unavailable')),
      },
    });
    const runner = new OverviewRunner(deps);
    const result = await runner.run({ ...RUN_OPTIONS, publish: true });

    expect(result.status).toBe('PARTIAL');
    expect(result.telegramPublished).toBe(false);
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('returns PUBLISHED_DEGRADED with deterministic fallback when LLM client throws', async () => {
    const repo = makeRepo();
    const publisher = {
      chatId: 'chat-real',
      publish: vi.fn().mockResolvedValue(['msg-degraded']),
    };
    const deps = makeDeps({
      repository: repo,
      publisher,
      llmClient: {
        modelName: 'test-model',
        generateOverview: vi.fn().mockRejectedValue(new Error('429 RESOURCE_EXHAUSTED daily quota exceeded')),
      },
    });
    const runner = new OverviewRunner(deps);
    const result = await runner.run({ ...RUN_OPTIONS, publish: true });

    expect(result.status).toBe('PUBLISHED_DEGRADED');
    expect(result.telegramPublished).toBe(true);
    expect(result.telegramPostIds).toEqual(['msg-degraded']);
    expect(result.output).toEqual(expect.objectContaining({
      generationMode: 'TEMPLATE_FALLBACK',
      llmErrorKind: 'DAILY_QUOTA_EXHAUSTED',
      outputSource: 'deterministic_fallback',
    }));
    expect(repo.saveOverview).toHaveBeenCalledWith(expect.objectContaining({
      status: 'PUBLISHED_DEGRADED',
      outputJson: expect.objectContaining({
        generationMode: 'TEMPLATE_FALLBACK',
        llmErrorKind: 'DAILY_QUOTA_EXHAUSTED',
      }),
    }));
    expect(publisher.publish).toHaveBeenCalledWith(expect.stringContaining('<b>Crypto US Brief</b>'), 'US_CRYPTO');
  });

  it('publishes to Telegram and saves post records when publish=true', async () => {
    const publisher = {
      chatId: 'chat-real',
      publish: vi.fn().mockResolvedValue(['msg-101', 'msg-102']),
    };
    const repo = makeRepo();
    const deps = makeDeps({ repository: repo, publisher });
    const runner = new OverviewRunner(deps);
    const result = await runner.run({ ...RUN_OPTIONS, publish: true });

    expect(result.status).toBe('SUCCESS');
    expect(result.telegramPublished).toBe(true);
    expect(publisher.publish).toHaveBeenCalled();
    const [telegramText] = publisher.publish.mock.calls[0] as [string];
    expect(telegramText).toContain('<b>Crypto US Brief</b>');
    expect(telegramText).toContain('<code>');
    expect(result.humanReport).toContain('Crypto US Brief ·');
    expect(result.humanReport).not.toContain('<b>');
    expect(repo.saveTelegramPost).toHaveBeenCalled();
    expect(repo.saveTelegramPost).toHaveBeenCalledWith(expect.objectContaining({
      status: 'SENT',
      chatId: 'chat-real',
      text: expect.stringContaining('<b>Crypto US Brief</b>'),
    }));
    expect(repo.updateOverviewTelegramPosts).toHaveBeenCalled();
  });

  it('saves a failed Telegram post when publishing throws', async () => {
    const publisher = {
      publish: vi.fn().mockRejectedValue(new Error('Telegram unavailable')),
    };
    const repo = makeRepo();
    const deps = makeDeps({ repository: repo, publisher });
    const runner = new OverviewRunner(deps);
    const result = await runner.run({ ...RUN_OPTIONS, publish: true });

    expect(result.status).toBe('SUCCESS');
    expect(result.telegramPublished).toBe(false);
    expect(repo.saveOverview).toHaveBeenCalled();
    expect(repo.saveTelegramPost).toHaveBeenCalledWith(expect.objectContaining({
      overviewId: 'overview-id-1',
      status: 'FAILED',
      errorMessage: 'Telegram unavailable',
      messageIndex: 0,
      text: expect.any(String),
    }));
  });

  it('compacts verbose reports into a single Telegram message', async () => {
    const longOutput = makeValidOutput();
    longOutput.btc.summary = 'BTC '.repeat(1500);
    const publisher = {
      publish: vi.fn().mockResolvedValue(['msg-1']),
    };
    const repo = makeRepo();
    const deps = makeDeps({
      repository: repo,
      publisher,
      llmClient: {
        modelName: 'test-model',
        generateOverview: vi.fn().mockResolvedValue({ output: longOutput }),
      },
    });
    const runner = new OverviewRunner(deps);
    const result = await runner.run({ ...RUN_OPTIONS, publish: true });

    expect(result.telegramPublished).toBe(true);
    expect(result.telegramPostIds).toEqual(['msg-1']);
    expect(publisher.publish).toHaveBeenCalledTimes(1);
    for (const call of publisher.publish.mock.calls) {
      const [chunk] = call as [string];
      expect(chunk.length).toBeLessThanOrEqual(4096);
    }
    expect(repo.updateOverviewTelegramPosts).toHaveBeenCalledWith('overview-id-1', ['msg-1']);
    expect(repo.saveTelegramPost).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'FAILED' }));
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
    const { mergeMacroRatesContext, contextCollectorEntry } = await import('../src/context-merge.js');

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
        contextCollectorEntry(fredCollector, mergeMacroRatesContext),
        contextCollectorEntry(ecbCollector, mergeMacroRatesContext),
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

  it('passes cross-market, ETF, and options context to repository overview records', async () => {
    const { mergeEtfFlowContext, mergeOptionsContext, contextCollectorEntry } = await import('../src/context-merge.js');
    const repo = makeRepo();
    const etfCollector = {
      sourceName: 'sosovalue-etf',
      collect: vi.fn().mockResolvedValue({
        status: 'success' as const,
        data: { btcFlowUsd: 12_000_000, date: '2026-06-01', source: 'sosovalue', sourceAvailable: true },
        itemCount: 1,
      }),
    };
    const optionsCollector = {
      sourceName: 'deribit-options',
      collect: vi.fn().mockResolvedValue({
        status: 'success' as const,
        data: [{ symbol: 'BTC', maxPainStrike: 75000 }],
        itemCount: 1,
      }),
    };
    const deps = makeDeps({
      repository: repo,
      contextCollectors: [
        contextCollectorEntry(etfCollector, mergeEtfFlowContext),
        contextCollectorEntry(optionsCollector, mergeOptionsContext),
      ],
    });
    const runner = new OverviewRunner(deps);

    await runner.run(RUN_OPTIONS);

    expect(repo.saveOverview).toHaveBeenCalledWith(expect.objectContaining({
      crossMarket: expect.objectContaining({ ethBtcTrendLabel: expect.any(String) }),
      etfFlow: expect.objectContaining({ btcFlowUsd: 12_000_000 }),
      options: [expect.objectContaining({ symbol: 'BTC', maxPainStrike: 75000 })],
    }));
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
