type CountMap = Record<string, number>;

type DurationSummary = {
  count: number;
  sum: number;
  max: number;
  last: number;
};

type MetricsState = {
  overviewRunsTotal: CountMap;
  overviewRunDurationMs: DurationSummary;
  collectorRunsTotal: CountMap;
  collectorDurationMs: Record<string, DurationSummary>;
  telegramPublishTotal: CountMap;
  apiRequestsTotal: CountMap;
  hardInvariantViolationsTotal: number;
};

const state: MetricsState = {
  overviewRunsTotal: {},
  overviewRunDurationMs: { count: 0, sum: 0, max: 0, last: 0 },
  collectorRunsTotal: {},
  collectorDurationMs: {},
  telegramPublishTotal: {},
  apiRequestsTotal: {},
  hardInvariantViolationsTotal: 0,
};

function increment(map: CountMap, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

function recordDuration(summary: DurationSummary, durationMs: number): void {
  summary.count += 1;
  summary.sum += durationMs;
  summary.max = Math.max(summary.max, durationMs);
  summary.last = durationMs;
}

function normalizeLabel(value: string): string {
  return value.replace(/[^\w:./=-]/g, '_').slice(0, 120);
}

export const metrics = {
  recordOverviewRun(session: string, status: string, durationMs: number): void {
    increment(state.overviewRunsTotal, `session=${normalizeLabel(session)},status=${normalizeLabel(status)}`);
    recordDuration(state.overviewRunDurationMs, durationMs);
  },

  recordCollectorRun(collector: string, status: string, durationMs?: number): void {
    const collectorLabel = normalizeLabel(collector);
    increment(state.collectorRunsTotal, `collector=${collectorLabel},status=${normalizeLabel(status)}`);
    if (durationMs !== undefined) {
      state.collectorDurationMs[collectorLabel] = state.collectorDurationMs[collectorLabel] ?? { count: 0, sum: 0, max: 0, last: 0 };
      recordDuration(state.collectorDurationMs[collectorLabel]!, durationMs);
    }
  },

  recordTelegramPublish(status: 'SENT' | 'FAILED'): void {
    increment(state.telegramPublishTotal, `status=${status}`);
  },

  recordApiRequest(route: string, status: number): void {
    increment(state.apiRequestsTotal, `route=${normalizeLabel(route)},status=${status}`);
  },

  recordHardInvariantViolation(count = 1): void {
    state.hardInvariantViolationsTotal += count;
  },

  snapshot(): MetricsState {
    return {
      overviewRunsTotal: { ...state.overviewRunsTotal },
      overviewRunDurationMs: { ...state.overviewRunDurationMs },
      collectorRunsTotal: { ...state.collectorRunsTotal },
      collectorDurationMs: Object.fromEntries(
        Object.entries(state.collectorDurationMs).map(([collector, summary]) => [collector, { ...summary }]),
      ),
      telegramPublishTotal: { ...state.telegramPublishTotal },
      apiRequestsTotal: { ...state.apiRequestsTotal },
      hardInvariantViolationsTotal: state.hardInvariantViolationsTotal,
    };
  },
};
