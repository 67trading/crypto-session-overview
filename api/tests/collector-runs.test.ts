import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseDateParam, validateLimitParam } from '../src/router-validators.js';
import type { CollectorRunFilters, CollectorRunRecord } from '../../service/src/ports.js';

// ─── Inline simulation of GET /collector-runs handler logic ───────────────────
// Mirrors the filter-building block in api/src/router.ts so we can test it
// without spinning up an Express server.

type MockQuery = Record<string, string | undefined>;

interface MockResponse {
  statusCode: number;
  body: unknown;
}

const VALID_STATUSES = ['SUCCESS', 'PARTIAL', 'FAILED', 'SKIPPED'] as const;

async function simulateCollectorRunsHandler(
  query: MockQuery,
  listCollectorRuns: (f: CollectorRunFilters) => Promise<CollectorRunRecord[]>,
): Promise<MockResponse> {
  const { collectorName, status, limit, fromDate } = query;

  const limitResult = validateLimitParam(limit);
  if (!limitResult.ok) {
    return { statusCode: 400, body: { error: limitResult.error, code: limitResult.code } };
  }
  const fromDateVal = parseDateParam(fromDate);
  const filters: CollectorRunFilters = {
    ...(typeof collectorName === 'string' ? { collectorName } : {}),
    ...(typeof status === 'string' && (VALID_STATUSES as readonly string[]).includes(status)
      ? { status: status as NonNullable<CollectorRunFilters['status']> } : {}),
    ...(limitResult.value !== undefined ? { limit: limitResult.value } : {}),
    ...(fromDateVal !== undefined ? { fromDate: fromDateVal } : {}),
  };

  try {
    const runs = await listCollectorRuns(filters);
    return { statusCode: 200, body: { items: runs, count: runs.length } };
  } catch (err) {
    return { statusCode: 500, body: { error: err instanceof Error ? err.message : String(err) } };
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /collector-runs — status filter', () => {
  let listCollectorRuns: (f: CollectorRunFilters) => Promise<CollectorRunRecord[]>;

  beforeEach(() => {
    listCollectorRuns = vi.fn().mockResolvedValue([]) as unknown as typeof listCollectorRuns;
  });

  it('forwards status=PARTIAL to the service', async () => {
    await simulateCollectorRunsHandler({ status: 'PARTIAL' }, listCollectorRuns);
    expect(listCollectorRuns).toHaveBeenCalledWith(expect.objectContaining({ status: 'PARTIAL' }));
  });

  it('forwards status=SUCCESS to the service', async () => {
    await simulateCollectorRunsHandler({ status: 'SUCCESS' }, listCollectorRuns);
    expect(listCollectorRuns).toHaveBeenCalledWith(expect.objectContaining({ status: 'SUCCESS' }));
  });

  it('forwards status=FAILED to the service', async () => {
    await simulateCollectorRunsHandler({ status: 'FAILED' }, listCollectorRuns);
    expect(listCollectorRuns).toHaveBeenCalledWith(expect.objectContaining({ status: 'FAILED' }));
  });

  it('forwards status=SKIPPED to the service', async () => {
    await simulateCollectorRunsHandler({ status: 'SKIPPED' }, listCollectorRuns);
    expect(listCollectorRuns).toHaveBeenCalledWith(expect.objectContaining({ status: 'SKIPPED' }));
  });

  it('drops an unrecognised status and calls service with no status filter', async () => {
    await simulateCollectorRunsHandler({ status: 'INVALID' }, listCollectorRuns);
    const mockInstance = listCollectorRuns as unknown as ReturnType<typeof vi.fn>;
    const [calledFilters] = mockInstance.mock.calls[0] as [CollectorRunFilters];
    expect('status' in calledFilters).toBe(false);
  });

  it('omits status filter entirely when not provided', async () => {
    await simulateCollectorRunsHandler({}, listCollectorRuns);
    const mockInstance = listCollectorRuns as unknown as ReturnType<typeof vi.fn>;
    const [calledFilters] = mockInstance.mock.calls[0] as [CollectorRunFilters];
    expect('status' in calledFilters).toBe(false);
  });
});

describe('GET /collector-runs — other filters', () => {
  let listCollectorRuns: (f: CollectorRunFilters) => Promise<CollectorRunRecord[]>;

  beforeEach(() => {
    listCollectorRuns = vi.fn().mockResolvedValue([]) as unknown as typeof listCollectorRuns;
  });

  it('returns {items:[], count:0} with no query params', async () => {
    const res = await simulateCollectorRunsHandler({}, listCollectorRuns);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ items: [], count: 0 });
  });

  it('preserves reasonCode in collector run response payloads', async () => {
    const run: CollectorRunRecord = {
      collectorName: 'coinmarketcap-etf',
      startedAt: new Date('2026-01-01T00:00:00Z'),
      status: 'SKIPPED',
      itemCount: 0,
      reasonCode: 'NO_STABLE_API',
    };
    listCollectorRuns = vi.fn().mockResolvedValue([run]) as unknown as typeof listCollectorRuns;

    const res = await simulateCollectorRunsHandler({}, listCollectorRuns);

    expect(res.body).toEqual({ items: [run], count: 1 });
  });

  it('forwards collectorName filter', async () => {
    await simulateCollectorRunsHandler({ collectorName: 'calendar' }, listCollectorRuns);
    expect(listCollectorRuns).toHaveBeenCalledWith(expect.objectContaining({ collectorName: 'calendar' }));
  });

  it('forwards a valid limit filter', async () => {
    await simulateCollectorRunsHandler({ limit: '5' }, listCollectorRuns);
    expect(listCollectorRuns).toHaveBeenCalledWith(expect.objectContaining({ limit: 5 }));
  });

  it('returns 400 for non-numeric limit', async () => {
    const res = await simulateCollectorRunsHandler({ limit: 'abc' }, listCollectorRuns);
    expect(res.statusCode).toBe(400);
    expect((res.body as Record<string, unknown>).code).toBe('INVALID_LIMIT');
    expect(listCollectorRuns).not.toHaveBeenCalled();
  });

  it('returns 400 for out-of-range limit', async () => {
    const res = await simulateCollectorRunsHandler({ limit: '0' }, listCollectorRuns);
    expect(res.statusCode).toBe(400);
    expect((res.body as Record<string, unknown>).code).toBe('INVALID_LIMIT');
    expect(listCollectorRuns).not.toHaveBeenCalled();
  });

  it('returns 500 when service throws', async () => {
    listCollectorRuns = vi.fn().mockRejectedValue(new Error('db down')) as unknown as typeof listCollectorRuns;
    const res = await simulateCollectorRunsHandler({}, listCollectorRuns);
    expect(res.statusCode).toBe(500);
    expect((res.body as Record<string, unknown>).error).toBe('db down');
  });
});
