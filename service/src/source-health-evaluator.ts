import type { CollectorDataQuality, DataStatusValue, SourceHealthSummary } from './ports.js';

export type ComputedDataStatus = {
  price: DataStatusValue;
  events: DataStatusValue;
  derivatives: DataStatusValue;
  liquidations: DataStatusValue;
};

export type EnrichedCollectorQuality = CollectorDataQuality & {
  source?: string;
  durationMs?: number;
  dataFreshnessSeconds?: number;
  payloadHash?: string;
};

export function buildSourceHealthSummary(collectors: EnrichedCollectorQuality[]): SourceHealthSummary {
  return {
    collectors: collectors.map((c) => ({
      name: c.name,
      source: c.source ?? c.name,
      status: c.status,
      itemCount: c.itemCount,
      ...(c.durationMs !== undefined ? { durationMs: c.durationMs } : {}),
      ...(c.dataFreshnessSeconds !== undefined ? { dataFreshnessSeconds: c.dataFreshnessSeconds } : {}),
      ...(c.payloadHash !== undefined ? { payloadHash: c.payloadHash } : {}),
      ...(c.error !== undefined ? { error: c.error } : {}),
    })),
    healthyCount: collectors.filter((c) => c.status === 'success').length,
    partialCount: collectors.filter((c) => c.status === 'partial').length,
    failedCount: collectors.filter((c) => c.status === 'failed').length,
    skippedCount: collectors.filter((c) => c.status === 'skipped').length,
  };
}

export function computeDataStatus(params: {
  priceOk: boolean;
  derivativesOk: boolean;
  eventCollectors: CollectorDataQuality[];
}): ComputedDataStatus {
  const { priceOk, derivativesOk, eventCollectors } = params;

  const total = eventCollectors.length;
  const failedCount = eventCollectors.filter((c) => c.status === 'failed').length;
  const withItemsCount = eventCollectors.filter(
    (c) => c.status === 'success' && c.itemCount > 0,
  ).length;

  let events: DataStatusValue;
  if (total === 0) {
    events = 'unavailable';
  } else if (failedCount === total) {
    events = 'failed';
  } else if (failedCount > 0 || withItemsCount === 0) {
    // Some collectors failed, OR all succeeded but returned 0 items
    events = 'partial';
  } else {
    events = 'fresh';
  }

  return {
    price: priceOk ? 'fresh' : 'failed',
    events,
    derivatives: derivativesOk ? 'fresh' : 'failed',
    liquidations: 'unavailable',
  };
}
