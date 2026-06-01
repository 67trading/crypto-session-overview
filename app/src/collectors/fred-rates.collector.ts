import type { ContextCollector, CollectorRunContext, CollectorResult, MacroRatesContext } from '../../../service/src/ports.js';
import { defaultFredClient, type FredClient, type FredObservation, type FredSeriesResult } from './fred-client.js';

type FredSuccessResult = Extract<FredSeriesResult, { ok: true }>;
type FredWarning = NonNullable<FredSuccessResult['warning']>;

function isSuccessWithWarning(result: FredSeriesResult): result is FredSuccessResult & { warning: FredWarning } {
  return result.ok && result.warning !== undefined;
}

function isSuccessWithFreshness(result: FredSeriesResult): result is FredSuccessResult & { dataFreshnessSeconds: number } {
  return result.ok && result.dataFreshnessSeconds !== undefined;
}

function parseValue(obs: FredObservation[]): number | undefined {
  const v = obs.find((o) => o.value !== '.' && o.value !== '')?.value;
  if (v === undefined) return undefined;
  const n = parseFloat(v);
  return isNaN(n) ? undefined : n;
}

function computePceYoY(obs: FredObservation[]): number | undefined {
  // obs sorted desc: [0]=latest, [12]=~12 months ago
  const recent = parseFloat(obs[0]?.value ?? '');
  const yearAgo = parseFloat(obs[12]?.value ?? '');
  if (isNaN(recent) || isNaN(yearAgo) || yearAgo === 0) return undefined;
  return parseFloat((((recent - yearAgo) / yearAgo) * 100).toFixed(2));
}

export class FredRatesCollector implements ContextCollector<MacroRatesContext> {
  readonly sourceName = 'fred-rates';

  constructor(
    private readonly apiKey: string,
    private readonly fredClient: FredClient = defaultFredClient,
  ) {}

  async collect(_ctx: CollectorRunContext): Promise<CollectorResult<MacroRatesContext>> {
    const results = await this.fredClient.getSeriesLatestMany(this.apiKey, [
      { seriesId: 'FEDFUNDS', limit: 1 },
      { seriesId: 'DGS10', limit: 1 },
      { seriesId: 'DGS2', limit: 1 },
      { seriesId: 'PCEPI', limit: 14 },
    ]) as [FredSeriesResult, FredSeriesResult, FredSeriesResult, FredSeriesResult];
    const [fedFundsRes, dgs10Res, dgs2Res, pcepRes] = results;

    const allResults: FredSeriesResult[] = results;
    const failures = allResults.filter((r): r is Extract<FredSeriesResult, { ok: false }> => !r.ok);
    const warnings = allResults
      .filter(isSuccessWithWarning)
      .map((r) => r.warning);
    const quotaLimited = [...failures, ...warnings].some((r) => r.reasonCode === 'ACCESS_LIMITED_QUOTA');

    const fedFundsRate = parseValue(fedFundsRes.ok ? fedFundsRes.observations : []);
    const us10yYield = parseValue(dgs10Res.ok ? dgs10Res.observations : []);
    const us2yYield = parseValue(dgs2Res.ok ? dgs2Res.observations : []);
    const pceYoY = computePceYoY(pcepRes.ok ? pcepRes.observations : []);

    const fieldCount = [fedFundsRate, us10yYield, us2yYield, pceYoY].filter((v) => v !== undefined).length;
    const messages = [...failures.map((r) => r.message), ...warnings.map((r) => r.message)];
    const staleFreshness = allResults
      .filter(isSuccessWithFreshness)
      .map((r) => r.dataFreshnessSeconds);
    const dataFreshnessSeconds = staleFreshness.length > 0 ? Math.max(...staleFreshness) : undefined;

    if (fieldCount === 0) {
      return messages.length > 0
        ? {
            status: quotaLimited ? 'skipped' : 'failed',
            itemCount: 0,
            reasonCode: quotaLimited ? 'ACCESS_LIMITED_QUOTA' : 'TRANSIENT_NETWORK_ERROR',
            error: messages.join('; '),
          }
        : { status: 'partial', itemCount: 0 };
    }

    const data: MacroRatesContext = {
      ...(fedFundsRate !== undefined ? { fedFundsRate } : {}),
      ...(us10yYield !== undefined ? { us10yYield } : {}),
      ...(us2yYield !== undefined ? { us2yYield } : {}),
      ...(pceYoY !== undefined ? { pceYoY } : {}),
      dataDate: new Date().toISOString().slice(0, 10),
    };

    return {
      status: messages.length > 0 ? 'partial' : 'success',
      data,
      itemCount: fieldCount,
      ...(dataFreshnessSeconds !== undefined ? { dataFreshnessSeconds } : {}),
      ...(messages.length > 0
        ? {
            reasonCode: quotaLimited ? 'ACCESS_LIMITED_QUOTA' as const : 'TRANSIENT_NETWORK_ERROR' as const,
            error: messages.join('; '),
          }
        : {}),
    };
  }
}
