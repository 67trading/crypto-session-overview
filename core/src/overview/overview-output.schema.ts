import { z } from 'zod';

const DataStatusValueSchema = z.enum(['fresh', 'stale', 'partial', 'failed', 'unavailable']);

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
  briefConfidence: z.enum(['low', 'medium', 'high']),

  dataStatus: z.object({
    price: DataStatusValueSchema,
    events: DataStatusValueSchema,
    derivatives: DataStatusValueSchema,
    liquidations: DataStatusValueSchema,
  }),

  whatChanged: z.array(z.string()).min(1).max(8),

  btc: z.object({
    summary: z.string(),
    keyLevels: z.array(z.string()),
    position: z.string(),
    structure: z.enum(['bullish', 'bearish', 'range', 'transition', 'unknown']),
  }),

  eth: z.object({
    summary: z.string(),
    vsbtc: z.string(),
    keyLevels: z.array(z.string()),
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
  }),

  derivatives: z.object({
    summary: z.string(),
    funding: z.string(),
    oi: z.string(),
    positioning: z.string(),
  }),

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
