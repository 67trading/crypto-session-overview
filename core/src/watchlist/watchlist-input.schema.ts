import { z } from 'zod';

export const WatchlistSessionSchema = z.enum([
  'ASIA_CRYPTO',
  'EUROPE_CRYPTO',
  'US_CRYPTO',
]);

export const WatchlistRunModeSchema = z.enum([
  'scheduled',
  'manual',
  'test',
]);

export const WatchlistRunRequestSchema = z.object({
  date: z.string(),
  session: WatchlistSessionSchema,
  timezone: z.string(),
  mode: WatchlistRunModeSchema,
});

export const WatchlistSourceStatusSchema = z.enum([
  'fresh',
  'partial',
  'stale',
  'missing',
]);

export const WatchlistMarketContextInputSchema = z.object({
  contextSource: z.enum([
    'market_brief',
    'watchlist_pipeline',
    'mixed',
    'missing',
  ]),
  sourceOverviewId: z.string().nullable().optional(),
  marketRegime: z.string().nullable(),
  btcContext: z.string().nullable(),
  ethContext: z.string().nullable(),
  macroRisk: z.string().nullable(),
  leadingNarratives: z.array(z.string()),
  cautionFlags: z.array(z.string()),
  dataStatus: WatchlistSourceStatusSchema,
});

export const WatchlistInputSchema = z.object({
  run: WatchlistRunRequestSchema,
  marketContext: WatchlistMarketContextInputSchema,
  sourceHealth: z.record(
    z.object({
      status: WatchlistSourceStatusSchema,
      notes: z.array(z.string()),
    }),
  ).optional(),
});

export type WatchlistSession = z.infer<typeof WatchlistSessionSchema>;
export type WatchlistRunMode = z.infer<typeof WatchlistRunModeSchema>;
export type WatchlistRunRequest = z.infer<typeof WatchlistRunRequestSchema>;
export type WatchlistMarketContextInput = z.infer<typeof WatchlistMarketContextInputSchema>;
export type WatchlistInput = z.infer<typeof WatchlistInputSchema>;
