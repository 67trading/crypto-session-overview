import { z } from 'zod';

export const WatchlistTierSchema = z.enum([
  'A_LIST',
  'B_LIST',
  'CANDIDATE_POOL',
  'EXCLUDED',
]);

export const WatchlistScoreComponentKeySchema = z.enum([
  'liquidity',
  'volatility',
  'relativeStrength',
  'sectorStrength',
  'catalystQuality',
  'technicalStructure',
  'riskDataQuality',
]);

export const WatchlistEvidenceCategorySchema = z.enum([
  'liquidity',
  'volume_expansion',
  'volatility',
  'relative_strength',
  'sector_strength',
  'catalyst',
  'technical_structure',
  'onchain_or_protocol_metric',
  'macro_or_etf_context',
  'data_quality',
]);

export const WatchlistEvidenceStrengthSchema = z.enum([
  'strong',
  'moderate',
  'weak',
]);

export const WatchlistEvidenceSchema = z.object({
  category: WatchlistEvidenceCategorySchema,
  label: z.string().min(1),
  value: z.union([z.string(), z.number()]).nullable().optional(),
  sourceName: z.string().nullable().optional(),
  sourceTimestamp: z.string().nullable().optional(),
  strength: WatchlistEvidenceStrengthSchema,
});

export const WatchlistComponentScoreSchema = z.object({
  score: z.number().min(0).max(100),
  weight: z.number().min(0).max(100),
  contribution: z.number().min(0).max(100),
  evidence: z.array(z.string()),
  flags: z.array(z.string()),
  metrics: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
});

export const WatchlistScoreWeightsSchema = z.object({
  liquidity: z.literal(20),
  volatility: z.literal(15),
  relativeStrength: z.literal(20),
  sectorStrength: z.literal(15),
  catalystQuality: z.literal(10),
  technicalStructure: z.literal(15),
  riskDataQuality: z.literal(5),
});

export const WATCHLIST_SCORE_WEIGHTS = {
  liquidity: 20,
  volatility: 15,
  relativeStrength: 20,
  sectorStrength: 15,
  catalystQuality: 10,
  technicalStructure: 15,
  riskDataQuality: 5,
} as const;

export const WatchlistTierThresholdsSchema = z.object({
  aListMin: z.literal(80),
  bListMin: z.literal(65),
  candidatePoolMin: z.literal(50),
});

export const WATCHLIST_TIER_THRESHOLDS = {
  aListMin: 80,
  bListMin: 65,
  candidatePoolMin: 50,
} as const;

export const WatchlistComponentScoresSchema = z.object({
  liquidity: WatchlistComponentScoreSchema,
  volatility: WatchlistComponentScoreSchema,
  relativeStrength: WatchlistComponentScoreSchema,
  sectorStrength: WatchlistComponentScoreSchema,
  catalystQuality: WatchlistComponentScoreSchema,
  technicalStructure: WatchlistComponentScoreSchema,
  riskDataQuality: WatchlistComponentScoreSchema,
});

export type WatchlistTier = z.infer<typeof WatchlistTierSchema>;
export type WatchlistScoreComponentKey = z.infer<typeof WatchlistScoreComponentKeySchema>;
export type WatchlistEvidenceCategory = z.infer<typeof WatchlistEvidenceCategorySchema>;
export type WatchlistEvidence = z.infer<typeof WatchlistEvidenceSchema>;
export type WatchlistComponentScore = z.infer<typeof WatchlistComponentScoreSchema>;
export type WatchlistComponentScores = z.infer<typeof WatchlistComponentScoresSchema>;
