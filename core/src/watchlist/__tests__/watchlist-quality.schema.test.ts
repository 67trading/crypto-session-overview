import { describe, expect, it } from 'vitest';
import { WatchlistDataQualitySchema, WatchlistQualityControlSchema } from '../index.js';

const validDataQuality = {
  status: 'partial',
  generatedAtUtc: '2026-06-19T08:30:00.000Z',
  sourceFreshness: [
    {
      sourceName: 'market-data',
      status: 'fresh',
      lastUpdatedAt: '2026-06-19T08:29:00.000Z',
      ageMinutes: 1,
      notes: [],
    },
  ],
  missingSources: [],
  staleSources: [],
  warnings: ['Some catalyst sources are unavailable.'],
  assetWarnings: [],
};

describe('watchlist quality schemas', () => {
  it('accepts valid data-quality payloads', () => {
    const parsed = WatchlistDataQualitySchema.parse(validDataQuality);
    expect(parsed.status).toBe('partial');
    expect(parsed.sourceFreshness).toHaveLength(1);
  });

  it('accepts null freshness fields', () => {
    const parsed = WatchlistDataQualitySchema.parse({
      ...validDataQuality,
      sourceFreshness: [
        {
          sourceName: 'catalyst-source',
          status: 'missing',
          lastUpdatedAt: null,
          ageMinutes: null,
          notes: ['Source unavailable'],
        },
      ],
    });
    expect(parsed.sourceFreshness[0]?.lastUpdatedAt).toBeNull();
    expect(parsed.sourceFreshness[0]?.ageMinutes).toBeNull();
  });

  it('rejects invalid quality status', () => {
    expect(() =>
      WatchlistDataQualitySchema.parse({
        ...validDataQuality,
        status: 'ok',
      }),
    ).toThrow();
  });

  it('rejects invalid source freshness status', () => {
    expect(() =>
      WatchlistDataQualitySchema.parse({
        ...validDataQuality,
        sourceFreshness: [
          {
            sourceName: 'market-data',
            status: 'unknown',
            lastUpdatedAt: null,
            ageMinutes: null,
            notes: [],
          },
        ],
      }),
    ).toThrow();
  });

  it('accepts valid quality control result', () => {
    const parsed = WatchlistQualityControlSchema.parse({
      status: 'pass',
      checks: [
        {
          name: 'a_list_max_size',
          status: 'pass',
          message: 'A-List has 3 assets (max 5).',
        },
      ],
      blockingIssues: [],
      warnings: [],
    });
    expect(parsed.status).toBe('pass');
    expect(parsed.checks).toHaveLength(1);
  });

  it('rejects invalid QC status', () => {
    expect(() =>
      WatchlistQualityControlSchema.parse({
        status: 'error',
        checks: [],
        blockingIssues: [],
        warnings: [],
      }),
    ).toThrow();
  });
});
