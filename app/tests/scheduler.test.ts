import { describe, expect, it } from 'vitest';
import { buildScheduleEntries, buildScheduledRunOptions } from '../src/scheduler.js';
import type { AppConfig } from '../src/config.js';

function makeConfig(): AppConfig {
  return {
    bybit: { baseUrl: 'https://api.bybit.com' },
    gemini: { apiKey: 'test', model: 'gemini-test' },
    telegram: { botToken: '', chatId: '', enabled: true },
    symbols: { core: ['BTCUSDT', 'ETHUSDT'], major: ['SOLUSDT'], watch: [] },
    database: { url: 'postgresql://user:pass@localhost:5432/test' },
    server: {
      port: 0,
      apiToken: 'secret',
      triggerRateLimit: { maxRequests: 1, windowMs: 60_000 },
    },
    scheduler: {
      enabled: true,
      timezone: 'Europe/Berlin',
      cronAsia: '30 1 * * *',
      cronEurope: '30 8 * * *',
      cronUs: '0 15 * * *',
    },
  };
}

describe('scheduler helpers', () => {
  it('builds all configured schedule entries', () => {
    expect(buildScheduleEntries(makeConfig())).toEqual([
      { session: 'ASIA_CRYPTO', cronExpr: '30 1 * * *' },
      { session: 'EUROPE_CRYPTO', cronExpr: '30 8 * * *' },
      { session: 'US_CRYPTO', cronExpr: '0 15 * * *' },
    ]);
  });

  it('passes targetSessionDate based on scheduler timezone for Asia midnight rollover', () => {
    const options = buildScheduledRunOptions(
      'ASIA_CRYPTO',
      makeConfig(),
      new Date('2026-06-03T23:30:00.000Z'),
    );

    expect(options).toEqual(expect.objectContaining({
      session: 'ASIA_CRYPTO',
      publish: true,
      symbols: { core: ['BTCUSDT', 'ETHUSDT'], major: ['SOLUSDT'], watch: [] },
      targetSessionDate: '2026-06-04',
      now: new Date('2026-06-03T23:30:00.000Z'),
    }));
  });
});
