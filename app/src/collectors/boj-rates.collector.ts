import type { ContextCollector, CollectorRunContext, CollectorResult, MacroRatesContext } from '../../../service/src/ports.js';
import { defaultFredClient, type FredClient, type FredSeriesResult } from './fred-client.js';

// OECD via FRED: Japan Immediate Rates (overnight call rate)
const BOJ_SERIES = 'IRSTCB01JPM156N';

export class BojRatesCollector implements ContextCollector<MacroRatesContext> {
  readonly sourceName = 'boj-rates';

  constructor(
    private readonly fredApiKey: string,
    private readonly fredClient: FredClient = defaultFredClient,
  ) {}

  async collect(_ctx: CollectorRunContext): Promise<CollectorResult<MacroRatesContext>> {
    const result = await this.fredClient.getSeriesLatest(this.fredApiKey, BOJ_SERIES, 1);
    return this.resultToCollector(result);
  }

  private resultToCollector(result: FredSeriesResult): CollectorResult<MacroRatesContext> {
    if (!result.ok) {
      return {
        status: result.reasonCode === 'ACCESS_LIMITED_QUOTA' ? 'skipped' : 'failed',
        itemCount: 0,
        reasonCode: result.reasonCode,
        error: result.message,
      };
    }

    const raw = result.observations.find((o) => o.value !== '.' && o.value !== '')?.value;
    if (raw === undefined) return { status: 'partial', itemCount: 0 };

    const bojPolicyRate = parseFloat(raw);
    if (isNaN(bojPolicyRate)) return { status: 'partial', itemCount: 0 };

    const data: MacroRatesContext = {
      bojPolicyRate,
      dataDate: new Date().toISOString().slice(0, 10),
    };

    return {
      status: result.warning !== undefined ? 'partial' : 'success',
      data,
      itemCount: 1,
      ...(result.dataFreshnessSeconds !== undefined ? { dataFreshnessSeconds: result.dataFreshnessSeconds } : {}),
      ...(result.warning !== undefined
        ? {
            reasonCode: result.warning.reasonCode,
            error: result.warning.message,
          }
        : {}),
    };
  }
}
