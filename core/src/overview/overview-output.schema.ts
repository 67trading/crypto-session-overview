import { z } from 'zod';

const DataStatusValueSchema = z.enum(['fresh', 'stale', 'partial', 'failed', 'unavailable']);
const ConfidenceLabelSchema = z.enum(['low', 'medium', 'high']);
const SourceScopeSchema = z.enum(['single_venue', 'cross_venue', 'tracked_basket', 'broad_alt_perp_tape', 'market_wide_top_n', 'market_wide', 'options_exchange', 'announcement_source', 'unknown']);
const VerificationStatusSchema = z.enum(['confirmed_cross_venue', 'confirmed_single_source', 'source_scoped', 'ambiguous', 'unavailable', 'stale']);

export const OverviewOutputSchema = z.object({
  briefId: z.string(),
  generatedAtUtc: z.string(),
  session: z.enum(['ASIA_CRYPTO', 'EUROPE_CRYPTO', 'US_CRYPTO']),

  marketRegime: z.enum([
    'risk_on_expansion',
    'constructive_but_extended',
    'defensive_range_bound',
    'range_compression',
    'long_heavy_near_resistance',
    'short_heavy_near_support',
    'risk_off',
    'event_driven',
    'mixed',
    'unknown',
  ]),
  briefConfidence: ConfidenceLabelSchema,
  confidenceBreakdown: z.object({
    signalClarity: z.number(),
    dataCoverage: z.number(),
    venueAgreement: z.number(),
    ambiguityPenalty: z.number(),
    finalScore: z.number(),
    label: ConfidenceLabelSchema,
    reasons: z.array(z.string()),
  }).optional(),

  dataStatus: z.object({
    price: DataStatusValueSchema,
    events: DataStatusValueSchema,
    derivatives: DataStatusValueSchema,
    liquidations: DataStatusValueSchema,
  }),

  coverage: z.object({
    summary: z.string(),
  }).optional(),

  whatChanged: z.array(z.string()).min(1).max(8),

  btc: z.object({
    summary: z.string(),
    keyLevels: z.array(z.string()),
    position: z.string(),
    structure: z.enum(['bullish', 'bearish', 'range', 'transition', 'unknown']),
    headerLabel: z.string().optional(),
  }),

  eth: z.object({
    summary: z.string(),
    vsbtc: z.string(),
    keyLevels: z.array(z.string()),
    headerLabel: z.string().optional(),
    ethUsd24hLabel: z.enum(['strong', 'weak', 'neutral', 'unknown']).optional(),
  }),

  majorAssets: z.array(z.object({
    symbol: z.string(),
    summary: z.string(),
    keyLevels: z.array(z.string()),
  })),

  alts: z.object({
    summary: z.string(),
    rotationState: z.enum(['broad_rotation', 'selective_rotation', 'no_rotation', 'weak', 'unknown']),
    breadth: z.string(),
    sourceScope: SourceScopeSchema.optional(),
    basketName: z.string().optional(),
    timeBasis: z.string().optional(),
    universeName: z.string().optional(),
    minVolumeUsd: z.number().optional(),
    venues: z.array(z.enum(['bybit', 'binance', 'okx', 'deribit'])).optional(),
    unavailableReason: z.string().optional(),
    canRenderBroadLabel: z.boolean().optional(),
  }),

  derivatives: z.object({
    summary: z.string(),
    funding: z.string(),
    oi: z.string(),
    positioning: z.string(),
    sourceScope: SourceScopeSchema.optional(),
    verificationStatus: VerificationStatusSchema.optional(),
  }),

  flows: z.object({
    bullets: z.array(z.string()),
  }).optional(),

  liquidity: z.object({
    immediateUpside: z.string().optional(),
    recoveryZone: z.string().optional(),
    largerUpsideMagnet: z.string().optional(),
    downsideVulnerability: z.string().optional(),
    bullets: z.array(z.string()).min(1),
  }),

  events: z.object({
    summary: z.string(),
    upcoming: z.array(z.object({
      title: z.string(),
      time: z.string(),
      importance: z.enum(['critical', 'high', 'medium', 'low']),
      displayTimeType: z.enum(['tradingEndsAt', 'effectiveAt', 'publishedAt', 'detectedAt', 'scheduledTime']).optional(),
      detail: z.string().optional(),
      verificationStatus: VerificationStatusSchema.optional(),
    })),
  }),

  scenarios: z.object({
    reclaim: z.string(),
    rejection: z.string(),
    chop: z.string(),
  }),

  note: z.string(),
});

export type OverviewOutput = z.infer<typeof OverviewOutputSchema>;

export type MarketRegime = z.infer<typeof OverviewOutputSchema>['marketRegime'];
export type DataStatusValue = 'fresh' | 'stale' | 'partial' | 'failed' | 'unavailable';
export type DataStatus = z.infer<typeof OverviewOutputSchema>['dataStatus'];
