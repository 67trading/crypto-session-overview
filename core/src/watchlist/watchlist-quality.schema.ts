import { z } from 'zod';

export const WatchlistDataQualityStatusSchema = z.enum([
  'complete',
  'partial',
  'degraded',
  'failed',
]);

export const WatchlistAssetDataStatusSchema = z.enum([
  'complete',
  'partial',
  'stale',
  'missing',
]);

export const WatchlistSourceFreshnessStatusSchema = z.enum([
  'fresh',
  'stale',
  'missing',
  'conflicting',
]);

export const WatchlistSourceFreshnessSchema = z.object({
  sourceName: z.string().min(1),
  status: WatchlistSourceFreshnessStatusSchema,
  lastUpdatedAt: z.string().nullable(),
  ageMinutes: z.number().nullable(),
  notes: z.array(z.string()),
});

export const WatchlistAssetDataQualitySchema = z.object({
  symbol: z.string().min(1),
  status: WatchlistAssetDataStatusSchema,
  missingFields: z.array(z.string()),
  staleFields: z.array(z.string()),
  warnings: z.array(z.string()),
});

export const WatchlistDataQualitySchema = z.object({
  status: WatchlistDataQualityStatusSchema,
  generatedAtUtc: z.string(),
  sourceFreshness: z.array(WatchlistSourceFreshnessSchema),
  missingSources: z.array(z.string()),
  staleSources: z.array(z.string()),
  warnings: z.array(z.string()),
  assetWarnings: z.array(WatchlistAssetDataQualitySchema),
});

export const WatchlistQualityCheckStatusSchema = z.enum([
  'pass',
  'warn',
  'fail',
]);

export const WatchlistQualityCheckSchema = z.object({
  name: z.string().min(1),
  status: WatchlistQualityCheckStatusSchema,
  message: z.string(),
});

export const WatchlistQualityControlSchema = z.object({
  status: WatchlistQualityCheckStatusSchema,
  checks: z.array(WatchlistQualityCheckSchema),
  blockingIssues: z.array(z.string()),
  warnings: z.array(z.string()),
});

export type WatchlistDataQualityStatus = z.infer<typeof WatchlistDataQualityStatusSchema>;
export type WatchlistAssetDataQuality = z.infer<typeof WatchlistAssetDataQualitySchema>;
export type WatchlistDataQuality = z.infer<typeof WatchlistDataQualitySchema>;
export type WatchlistQualityControl = z.infer<typeof WatchlistQualityControlSchema>;
