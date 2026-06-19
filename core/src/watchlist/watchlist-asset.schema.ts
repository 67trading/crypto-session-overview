import { z } from 'zod';
import {
  WatchlistComponentScoresSchema,
  WatchlistEvidenceSchema,
  WatchlistTierSchema,
} from './watchlist-score.schema.js';
import { WatchlistAssetDataQualitySchema } from './watchlist-quality.schema.js';

export const WatchlistSectorSchema = z.enum([
  'Layer 1',
  'Layer 2',
  'DeFi',
  'RWA',
  'AI',
  'DePIN',
  'Gaming',
  'Meme',
  'Liquid Staking',
  'Oracle',
  'Bitcoin Ecosystem',
  'Ethereum Ecosystem',
  'Solana Ecosystem',
  'Other',
  'Unknown',
]);

export const WatchlistSectorStatusSchema = z.enum([
  'strong',
  'improving',
  'mixed',
  'weak',
  'extended',
  'unknown',
]);

export const WatchlistCatalystTypeSchema = z.enum([
  'token_unlock',
  'protocol_upgrade',
  'governance',
  'ecosystem_news',
  'tvl_revenue_activity',
  'security_incident',
  'regulatory',
  'macro',
  'etf_flow',
  'other',
]);

export const WatchlistCatalystQualitySchema = z.enum([
  'verified',
  'partial',
  'weak',
]);

export const WatchlistCatalystSentimentSchema = z.enum([
  'positive',
  'negative',
  'mixed',
  'risk',
]);

export const WatchlistCatalystSchema = z.object({
  type: WatchlistCatalystTypeSchema,
  title: z.string().min(1),
  assetSymbols: z.array(z.string().min(1)),
  eventTime: z.string().nullable(),
  sourceName: z.string().min(1),
  sourceTimestamp: z.string(),
  quality: WatchlistCatalystQualitySchema,
  sentiment: WatchlistCatalystSentimentSchema,
});

export const WatchlistSectorMapItemSchema = z.object({
  sector: WatchlistSectorSchema,
  status: WatchlistSectorStatusSchema,
  representativeAssets: z.array(z.string().min(1)),
  notes: z.string(),
});

export const WatchlistAssetSchema = z.object({
  symbol: z.string().min(1),
  name: z.string().nullable(),
  assetId: z.string().min(1).optional(),
  sector: WatchlistSectorSchema.nullable(),

  rank: z.number().int().positive(),
  score: z.number().min(0).max(100),
  tier: WatchlistTierSchema,

  componentScores: WatchlistComponentScoresSchema,

  drivers: z.array(z.string()),
  limitations: z.array(z.string()),
  evidence: z.array(WatchlistEvidenceSchema),

  whyItMattersToday: z.string(),
  observationArea: z.string().nullable(),
  watchCondition: z.string().nullable(),
  invalidationContext: z.string().nullable(),
  riskNotes: z.array(z.string()),

  dataQuality: WatchlistAssetDataQualitySchema.optional(),

  isSignal: z.literal(false),
});

export const WatchlistDowngradeReasonCodeSchema = z.enum([
  'LOW_LIQUIDITY',
  'WEAK_VOLUME_STABILITY',
  'POOR_SPREAD_PROXY',
  'EXTENDED_MOVE',
  'WEAK_VS_BTC',
  'WEAK_VS_ETH',
  'WEAK_SECTOR',
  'NO_CLEAR_STRUCTURE',
  'MISSING_TECHNICAL_DATA',
  'STALE_MARKET_DATA',
  'NEGATIVE_CATALYST',
  'NEWS_SHOCK_RISK',
  'SOURCE_CONFLICT',
  'OVERCONCENTRATION_LIMIT',
  'QUALITY_GATE_FAILED',
]);

export const WatchlistRemovedDowngradedAssetSchema = z.object({
  symbol: z.string().min(1),
  name: z.string().nullable(),
  previousTier: WatchlistTierSchema.nullable().optional(),
  finalTier: WatchlistTierSchema,
  reasonCodes: z.array(WatchlistDowngradeReasonCodeSchema).min(1),
  explanation: z.string().min(1),
  relevantMetrics: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
});

export type WatchlistSector = z.infer<typeof WatchlistSectorSchema>;
export type WatchlistCatalyst = z.infer<typeof WatchlistCatalystSchema>;
export type WatchlistSectorMapItem = z.infer<typeof WatchlistSectorMapItemSchema>;
export type WatchlistAsset = z.infer<typeof WatchlistAssetSchema>;
export type WatchlistRemovedDowngradedAsset = z.infer<typeof WatchlistRemovedDowngradedAssetSchema>;
export type WatchlistDowngradeReasonCode = z.infer<typeof WatchlistDowngradeReasonCodeSchema>;
