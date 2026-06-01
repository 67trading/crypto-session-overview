import type { CollectorReasonCode } from '../../../service/src/ports.js';

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';
const UA = 'trader-agent/session-overview';

export interface FredObservation {
  date?: string;
  value: string;
}

interface FredResponse {
  observations?: FredObservation[];
}

export type FredSeriesResult =
  | {
      ok: true;
      observations: FredObservation[];
      fromCache: boolean;
      dataFreshnessSeconds?: number;
      warning?: {
        status: number;
        message: string;
        reasonCode: CollectorReasonCode;
      };
    }
  | {
      ok: false;
      status: number;
      message: string;
      reasonCode: CollectorReasonCode;
    };

type CacheEntry = {
  observations: FredObservation[];
  fetchedAt: number;
  expiresAt: number;
};

type CooldownEntry = {
  until: number;
  status: number;
  message: string;
  reasonCode: CollectorReasonCode;
};

export type FredClientOptions = {
  now?: () => number;
  quotaCooldownMs?: number;
  ttlMsForSeries?: (seriesId: string, limit: number) => number;
};

const DEFAULT_QUOTA_COOLDOWN_MS = 15 * 60 * 1000;
const YIELD_TTL_MS = 6 * 60 * 60 * 1000;
const POLICY_TTL_MS = 24 * 60 * 60 * 1000;

function defaultTtlMsForSeries(seriesId: string, _limit: number): number {
  if (seriesId === 'DGS10' || seriesId === 'DGS2' || seriesId === 'T10Y2Y') return YIELD_TTL_MS;
  return POLICY_TTL_MS;
}

function mapFredError(status: number, seriesId: string, statusText: string): Omit<Extract<FredSeriesResult, { ok: false }>, 'ok'> {
  if (status === 429) {
    return {
      status,
      reasonCode: 'ACCESS_LIMITED_QUOTA',
      message: `FRED ${seriesId}: ${status} ${statusText || 'Too Many Requests'}`,
    };
  }

  return {
    status,
    reasonCode: 'TRANSIENT_NETWORK_ERROR',
    message: `FRED ${seriesId}: ${status} ${statusText || 'HTTP error'}`,
  };
}

export class FredClient {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly cooldowns = new Map<string, CooldownEntry>();
  private readonly inFlight = new Map<string, Promise<FredSeriesResult>>();
  private readonly now: () => number;
  private readonly quotaCooldownMs: number;
  private readonly ttlMsForSeries: (seriesId: string, limit: number) => number;

  constructor(options: FredClientOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.quotaCooldownMs = options.quotaCooldownMs ?? DEFAULT_QUOTA_COOLDOWN_MS;
    this.ttlMsForSeries = options.ttlMsForSeries ?? defaultTtlMsForSeries;
  }

  getSeriesLatestMany(apiKey: string, requests: { seriesId: string; limit?: number }[]): Promise<FredSeriesResult[]> {
    return Promise.all(requests.map((request) => this.getSeriesLatest(apiKey, request.seriesId, request.limit ?? 1)));
  }

  getSeriesLatest(apiKey: string, seriesId: string, limit = 1): Promise<FredSeriesResult> {
    const key = this.cacheKey(apiKey, seriesId, limit);
    const existing = this.inFlight.get(key);
    if (existing !== undefined) return existing;

    const promise = this.getSeriesLatestUnqueued(apiKey, seriesId, limit)
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);
    return promise;
  }

  private async getSeriesLatestUnqueued(apiKey: string, seriesId: string, limit: number): Promise<FredSeriesResult> {
    const key = this.cacheKey(apiKey, seriesId, limit);
    const now = this.now();
    const cached = this.cache.get(key);
    if (cached !== undefined && cached.expiresAt > now) return this.cacheHit(cached, now);

    const cooldown = this.cooldowns.get(key);
    if (cooldown !== undefined && cooldown.until > now) {
      if (cached !== undefined) {
        return this.cacheHit(cached, now, {
          status: cooldown.status,
          message: cooldown.message,
          reasonCode: cooldown.reasonCode,
        });
      }

      return {
        ok: false,
        status: cooldown.status,
        message: cooldown.message,
        reasonCode: cooldown.reasonCode,
      };
    }

    const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${apiKey}&sort_order=desc&limit=${limit}&file_type=json`;
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) {
      const json = await res.json() as FredResponse;
      const observations = json.observations ?? [];
      const fetchedAt = this.now();
      this.cache.set(key, {
        observations,
        fetchedAt,
        expiresAt: fetchedAt + this.ttlMsForSeries(seriesId, limit),
      });
      this.cooldowns.delete(key);
      return { ok: true, observations, fromCache: false };
    }

    const error = mapFredError(res.status, seriesId, res.statusText);
    if (res.status === 429) {
      this.cooldowns.set(key, {
        until: this.now() + this.quotaCooldownMs,
        status: error.status,
        message: error.message,
        reasonCode: error.reasonCode,
      });

      if (cached !== undefined) {
        return this.cacheHit(cached, this.now(), {
          status: error.status,
          message: error.message,
          reasonCode: error.reasonCode,
        });
      }
    }

    return { ok: false, ...error };
  }

  private cacheHit(
    cached: CacheEntry,
    now: number,
    warning?: Extract<FredSeriesResult, { ok: true }>['warning'],
  ): FredSeriesResult {
    return {
      ok: true,
      observations: cached.observations,
      fromCache: true,
      dataFreshnessSeconds: Math.max(0, Math.floor((now - cached.fetchedAt) / 1000)),
      ...(warning !== undefined ? { warning } : {}),
    };
  }

  private cacheKey(apiKey: string, seriesId: string, limit: number): string {
    return `${apiKey}:${seriesId}:${limit}`;
  }
}

export const defaultFredClient = new FredClient();
