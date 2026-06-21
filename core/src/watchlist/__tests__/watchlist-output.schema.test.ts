import { describe, expect, it } from 'vitest';
import {
  CryptoDailyWatchlistOutputSchema,
  WATCHLIST_SCORE_WEIGHTS,
  WATCHLIST_TIER_THRESHOLDS,
} from '../index.js';

const componentScore = (score: number, weight: number) => ({
  score,
  weight,
  contribution: (score * weight) / 100,
  evidence: ['Fixture evidence'],
  flags: [],
  metrics: {},
});

const baseAsset = {
  symbol: 'SOL',
  name: 'Solana',
  assetId: 'solana',
  sector: 'Layer 1',
  rank: 1,
  score: 86,
  tier: 'A_LIST',
  componentScores: {
    liquidity: componentScore(90, 20),
    volatility: componentScore(80, 15),
    relativeStrength: componentScore(90, 20),
    sectorStrength: componentScore(85, 15),
    catalystQuality: componentScore(70, 10),
    technicalStructure: componentScore(85, 15),
    riskDataQuality: componentScore(90, 5),
  },
  drivers: ['relative strength', 'volume expansion', 'sector strength'],
  limitations: [],
  evidence: [
    {
      category: 'relative_strength',
      label: 'Outperforming BTC and ETH',
      strength: 'strong',
    },
    {
      category: 'liquidity',
      label: 'High 24h volume',
      strength: 'strong',
    },
  ],
  whyItMattersToday:
    'SOL is showing liquid relative strength with a usable observation area.',
  observationArea: 'Prior breakout zone',
  watchCondition:
    'Remains relevant if it holds the breakout zone and continues to outperform BTC.',
  invalidationContext: 'Loses the breakout area with weak relative performance.',
  riskNotes: ['Avoid chasing if price extends far above intraday range.'],
  dataQuality: {
    symbol: 'SOL',
    status: 'complete' as const,
    missingFields: [],
    staleFields: [],
    warnings: [],
  },
  isSignal: false as const,
};

const validOutput = {
  product: 'Crypto Daily Watchlist' as const,
  schemaVersion: '1.0.0' as const,
  id: 'watchlist-fixture-1',
  generatedAtUtc: '2026-06-19T08:30:00.000Z',
  timezone: 'Europe/Zurich',
  session: 'EUROPE_CRYPTO',
  status: 'complete',

  marketContext: {
    contextSource: 'market_brief',
    sourceOverviewId: 'overview-1',
    generatedAtUtc: '2026-06-19T08:00:00.000Z',
    marketRegime: 'neutral_to_risk_on',
    btcContext: {
      trendState: 'range',
      relativeState: 'neutral',
      notes: 'BTC is holding above a key area.',
    },
    ethContext: {
      trendState: 'uptrend',
      ethBtcState: 'outperforming',
      notes: 'ETH is slightly outperforming BTC.',
    },
    volatilityRegime: 'normal',
    macroRisk: 'medium',
    dominantNarratives: ['Layer 1', 'DeFi'],
    cautionFlags: [],
  },

  universe: {
    initialAssetCount: 200,
    eligibleAssetCount: 60,
    scoredAssetCount: 40,
    excludedAssetCount: 160,
    notes: ['Fixture universe.'],
  },

  scoring: {
    weights: WATCHLIST_SCORE_WEIGHTS,
    tierThresholds: WATCHLIST_TIER_THRESHOLDS,
  },

  watchlist: {
    aList: [baseAsset],
    bList: [],
    candidatePool: [],
    removedDowngraded: [
      {
        symbol: 'RNDR',
        name: 'Render',
        previousTier: null,
        finalTier: 'B_LIST',
        reasonCodes: ['EXTENDED_MOVE'],
        explanation: 'The asset is relevant but currently extended.',
        relevantMetrics: { priceChange24hPct: 12.5 },
      },
    ],
  },

  sectorMap: [
    {
      sector: 'Layer 1',
      status: 'strong',
      representativeAssets: ['SOL'],
      notes: 'Several liquid Layer 1 assets are showing relative strength.',
    },
  ],

  keyCatalysts: [],
  liquidityVolatilityNotes: [
    'A-List candidates have acceptable liquidity and tradable volatility.',
  ],
  traderChecklist: [
    {
      label: 'No chasing',
      detail: 'Wait for price behavior around the observation area.',
    },
  ],

  dataQuality: {
    status: 'complete',
    generatedAtUtc: '2026-06-19T08:30:00.000Z',
    sourceFreshness: [],
    missingSources: [],
    staleSources: [],
    warnings: [],
    assetWarnings: [],
  },

  qualityControl: {
    status: 'pass',
    checks: [],
    blockingIssues: [],
    warnings: [],
  },

  userFacingReport: {
    title: 'Crypto Daily Watchlist — Europe Session',
    summary:
      'The watchlist is selective and focused on liquid assets with relative strength.',
    aListTable: [
      {
        asset: 'SOL',
        sector: 'Layer 1',
        score: 86,
        whyItMattersToday:
          'SOL is showing liquid relative strength with a usable observation area.',
        observationArea: 'Prior breakout zone',
        watchCondition:
          'Remains relevant if it holds the breakout zone and continues to outperform BTC.',
      },
    ],
    bListTable: [],
    sectorNotes: 'Layer 1 is one of the cleaner areas today.',
    keyWatchConditions: [
      'SOL remains relevant if relative strength persists on pullbacks.',
    ],
    removedDowngradedNotes: ['RNDR is relevant but extended, so it is downgraded.'],
    dataQualityNotes: [],
    disclaimer:
      'This watchlist is not a trading signal. It is a prepared list of assets to observe for valid setups during the session.',
  },
};

describe('CryptoDailyWatchlistOutputSchema', () => {
  it('accepts a valid watchlist output', () => {
    const parsed = CryptoDailyWatchlistOutputSchema.parse(validOutput);
    expect(parsed.product).toBe('Crypto Daily Watchlist');
    expect(parsed.schemaVersion).toBe('1.0.0');
    expect(parsed.watchlist.aList).toHaveLength(1);
    expect(parsed.watchlist.aList[0]?.isSignal).toBe(false);
  });

  it('rejects watchlist assets marked as signals', () => {
    const invalid = JSON.parse(JSON.stringify(validOutput));
    invalid.watchlist.aList[0].isSignal = true;
    expect(() => CryptoDailyWatchlistOutputSchema.parse(invalid)).toThrow();
  });

  it('rejects more than five A-List assets', () => {
    const invalid = JSON.parse(JSON.stringify(validOutput));
    invalid.watchlist.aList = Array.from({ length: 6 }, (_, index) => ({
      ...baseAsset,
      symbol: `ASSET${index}`,
      rank: index + 1,
    }));
    expect(() => CryptoDailyWatchlistOutputSchema.parse(invalid)).toThrow();
  });

  it('accepts exactly five A-List assets', () => {
    const valid = JSON.parse(JSON.stringify(validOutput));
    valid.watchlist.aList = Array.from({ length: 5 }, (_, index) => ({
      ...baseAsset,
      symbol: `ASSET${index}`,
      rank: index + 1,
    }));
    const parsed = CryptoDailyWatchlistOutputSchema.parse(valid);
    expect(parsed.watchlist.aList).toHaveLength(5);
  });

  it('rejects more than seven B-List assets', () => {
    const invalid = JSON.parse(JSON.stringify(validOutput));
    invalid.watchlist.aList = [];
    invalid.watchlist.bList = Array.from({ length: 8 }, (_, index) => ({
      ...baseAsset,
      symbol: `BASSET${index}`,
      rank: index + 1,
      score: 70,
      tier: 'B_LIST',
    }));
    expect(() => CryptoDailyWatchlistOutputSchema.parse(invalid)).toThrow();
  });

  it('accepts exactly seven B-List assets', () => {
    const valid = JSON.parse(JSON.stringify(validOutput));
    valid.watchlist.aList = [];
    valid.watchlist.bList = Array.from({ length: 7 }, (_, index) => ({
      ...baseAsset,
      symbol: `BASSET${index}`,
      rank: index + 1,
      score: 70,
      tier: 'B_LIST',
    }));
    const parsed = CryptoDailyWatchlistOutputSchema.parse(valid);
    expect(parsed.watchlist.bList).toHaveLength(7);
  });

  it('rejects A-List asset with wrong tier literal', () => {
    const invalid = JSON.parse(JSON.stringify(validOutput));
    invalid.watchlist.aList[0].tier = 'B_LIST';
    expect(() => CryptoDailyWatchlistOutputSchema.parse(invalid)).toThrow();
  });

  it('rejects removed/downgraded asset with finalTier A_LIST', () => {
    const invalid = JSON.parse(JSON.stringify(validOutput));
    invalid.watchlist.removedDowngraded[0].finalTier = 'A_LIST';
    expect(() => CryptoDailyWatchlistOutputSchema.parse(invalid)).toThrow();
  });

  it('rejects wrong product literal', () => {
    const invalid = JSON.parse(JSON.stringify(validOutput));
    invalid.product = 'Market Brief';
    expect(() => CryptoDailyWatchlistOutputSchema.parse(invalid)).toThrow();
  });

  it('rejects wrong schema version', () => {
    const invalid = JSON.parse(JSON.stringify(validOutput));
    invalid.schemaVersion = '2.0.0';
    expect(() => CryptoDailyWatchlistOutputSchema.parse(invalid)).toThrow();
  });

  it('rejects invalid market regime', () => {
    const invalid = JSON.parse(JSON.stringify(validOutput));
    invalid.marketContext.marketRegime = 'super_bullish';
    expect(() => CryptoDailyWatchlistOutputSchema.parse(invalid)).toThrow();
  });

  it('accepts an empty watchlist (degraded output)', () => {
    const degraded = JSON.parse(JSON.stringify(validOutput));
    degraded.status = 'degraded';
    degraded.watchlist.aList = [];
    degraded.watchlist.bList = [];
    degraded.watchlist.candidatePool = [];
    degraded.userFacingReport.aListTable = [];
    const parsed = CryptoDailyWatchlistOutputSchema.parse(degraded);
    expect(parsed.status).toBe('degraded');
    expect(parsed.watchlist.aList).toHaveLength(0);
  });
});
