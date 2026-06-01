import { describe, expect, it, vi } from 'vitest';
import { GeminiLlmClient } from '../src/llm-client.js';
import type { OverviewInput, OverviewOutput } from '../../service/src/ports.js';

function makeInput(): OverviewInput {
  return {
    request: {
      session: 'EUROPE_CRYPTO',
      createdAt: '2026-06-01T14:00:00Z',
      timezone: 'UTC',
      allowedTimeframes: ['Weekly', 'Daily', '4H', 'Session'],
      forbiddenTimeframes: ['1H', '15m', '5m'],
    },
    universe: { coreSymbols: ['BTCUSDT', 'ETHUSDT'], majorSymbols: [], watchSymbols: [] },
    marketContext: { btcTone: 'neutral', ethVsBtc: 'in_line' },
    levels: {},
    sessionContext: null,
    derivativesContext: {},
    eventsForSession: [],
    activeSetups: [],
    dataQuality: { collectors: [], missingSources: [], failedSources: [] },
  };
}

function makeOutput(): OverviewOutput {
  return {
    briefId: 'brief-test',
    generatedAtUtc: '2026-06-01T14:00:00Z',
    session: 'EUROPE_CRYPTO',
    marketRegime: 'mixed',
    briefConfidence: 'medium',
    dataStatus: { price: 'fresh', events: 'fresh', derivatives: 'fresh', liquidations: 'unavailable' },
    whatChanged: ['No previous brief available for this session - initial reading.'],
    btc: { summary: 'BTC is range-bound.', keyLevels: [], position: 'inside range', structure: 'range' },
    eth: { summary: 'ETH is in line with BTC.', vsbtc: 'ETH/BTC sideways', keyLevels: [] },
    majorAssets: [],
    alts: { summary: 'Alts are mixed.', rotationState: 'unknown', breadth: 'data unavailable' },
    derivatives: { summary: 'Neutral.', funding: 'neutral', oi: 'stable', positioning: 'balanced' },
    liquidity: { bullets: ['No confirmed liquidity cluster data available.'] },
    events: { summary: 'Light calendar.', upcoming: [] },
    scenarios: { reclaim: 'Reclaim improves structure.', rejection: 'Rejection keeps range pressure.', chop: 'Range persists.' },
    note: 'Data quality normal.',
  };
}

describe('GeminiLlmClient', () => {
  it('requests enough output tokens for full JSON briefs', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify(makeOutput()),
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
    });
    const client = new GeminiLlmClient('test-key', 'gemini-2.5-flash', { generateContent });

    await client.generateOverview(makeInput());

    expect(generateContent).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gemini-2.5-flash',
      config: expect.objectContaining({
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      }),
    }));
  });
});
