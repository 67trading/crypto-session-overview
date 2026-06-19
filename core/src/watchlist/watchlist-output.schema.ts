import { z } from 'zod';
import { WatchlistSessionSchema } from './watchlist-input.schema.js';
import {
  WatchlistAListAssetSchema,
  WatchlistBListAssetSchema,
  WatchlistCandidatePoolAssetSchema,
  WatchlistCatalystSchema,
  WatchlistRemovedDowngradedAssetSchema,
  WatchlistSectorMapItemSchema,
} from './watchlist-asset.schema.js';
import {
  WatchlistDataQualitySchema,
  WatchlistQualityControlSchema,
} from './watchlist-quality.schema.js';
import {
  WatchlistScoreWeightsSchema,
  WatchlistTierThresholdsSchema,
} from './watchlist-score.schema.js';

export const CryptoDailyWatchlistStatusSchema = z.enum([
  'complete',
  'degraded',
  'failed',
]);

export const WatchlistMarketRegimeSchema = z.enum([
  'risk_on',
  'neutral_to_risk_on',
  'neutral',
  'neutral_to_risk_off',
  'risk_off',
  'high_event_risk',
  'mixed',
  'unknown',
]);

export const WatchlistTrendStateSchema = z.enum([
  'uptrend',
  'downtrend',
  'range',
  'mixed',
  'unknown',
]);

export const WatchlistRelativeStateSchema = z.enum([
  'leading',
  'lagging',
  'neutral',
  'unknown',
]);

export const WatchlistMarketContextSchema = z.object({
  contextSource: z.enum([
    'market_brief',
    'watchlist_pipeline',
    'mixed',
    'missing',
  ]),
  sourceOverviewId: z.string().nullable().optional(),
  generatedAtUtc: z.string(),

  marketRegime: WatchlistMarketRegimeSchema,

  btcContext: z.object({
    trendState: WatchlistTrendStateSchema,
    relativeState: WatchlistRelativeStateSchema,
    notes: z.string(),
  }),

  ethContext: z.object({
    trendState: WatchlistTrendStateSchema,
    ethBtcState: z.enum([
      'outperforming',
      'underperforming',
      'neutral',
      'unknown',
    ]),
    notes: z.string(),
  }),

  volatilityRegime: z.enum([
    'low',
    'normal',
    'elevated',
    'extreme',
    'unknown',
  ]),

  macroRisk: z.enum([
    'low',
    'medium',
    'high',
    'unknown',
  ]),

  dominantNarratives: z.array(z.string()),
  cautionFlags: z.array(z.string()),
});

export const WatchlistUniverseSummarySchema = z.object({
  initialAssetCount: z.number().int().nonnegative(),
  eligibleAssetCount: z.number().int().nonnegative(),
  scoredAssetCount: z.number().int().nonnegative(),
  excludedAssetCount: z.number().int().nonnegative(),
  notes: z.array(z.string()),
});

export const WatchlistTraderChecklistItemSchema = z.object({
  label: z.string().min(1),
  detail: z.string().min(1),
});

export const WatchlistUserFacingAListRowSchema = z.object({
  asset: z.string().min(1),
  sector: z.string().nullable(),
  score: z.number().min(0).max(100),
  whyItMattersToday: z.string(),
  observationArea: z.string().nullable(),
  watchCondition: z.string().nullable(),
});

export const WatchlistUserFacingBListRowSchema = z.object({
  asset: z.string().min(1),
  sector: z.string().nullable(),
  score: z.number().min(0).max(100),
  reasonForBList: z.string(),
  limitation: z.string(),
});

export const WatchlistUserFacingReportSchema = z.object({
  title: z.string(),
  summary: z.string(),
  aListTable: z.array(WatchlistUserFacingAListRowSchema),
  bListTable: z.array(WatchlistUserFacingBListRowSchema),
  sectorNotes: z.string(),
  keyWatchConditions: z.array(z.string()),
  removedDowngradedNotes: z.array(z.string()),
  dataQualityNotes: z.array(z.string()),
  disclaimer: z.string(),
});

export const CryptoDailyWatchlistOutputSchema = z.object({
  product: z.literal('Crypto Daily Watchlist'),
  schemaVersion: z.literal('1.0.0'),

  id: z.string().min(1),
  generatedAtUtc: z.string(),
  timezone: z.string(),
  session: WatchlistSessionSchema,
  status: CryptoDailyWatchlistStatusSchema,

  marketContext: WatchlistMarketContextSchema,
  universe: WatchlistUniverseSummarySchema,

  scoring: z.object({
    weights: WatchlistScoreWeightsSchema,
    tierThresholds: WatchlistTierThresholdsSchema,
  }),

  watchlist: z.object({
    aList: z.array(WatchlistAListAssetSchema).max(5),
    bList: z.array(WatchlistBListAssetSchema).max(7),
    candidatePool: z.array(WatchlistCandidatePoolAssetSchema),
    removedDowngraded: z.array(WatchlistRemovedDowngradedAssetSchema),
  }),

  sectorMap: z.array(WatchlistSectorMapItemSchema),
  keyCatalysts: z.array(WatchlistCatalystSchema),
  liquidityVolatilityNotes: z.array(z.string()),
  traderChecklist: z.array(WatchlistTraderChecklistItemSchema),

  dataQuality: WatchlistDataQualitySchema,
  qualityControl: WatchlistQualityControlSchema,

  userFacingReport: WatchlistUserFacingReportSchema,
});

export type CryptoDailyWatchlistOutput = z.infer<typeof CryptoDailyWatchlistOutputSchema>;
export type CryptoDailyWatchlistStatus = z.infer<typeof CryptoDailyWatchlistStatusSchema>;
export type WatchlistMarketContext = z.infer<typeof WatchlistMarketContextSchema>;
export type WatchlistUniverseSummary = z.infer<typeof WatchlistUniverseSummarySchema>;
export type WatchlistUserFacingReport = z.infer<typeof WatchlistUserFacingReportSchema>;
