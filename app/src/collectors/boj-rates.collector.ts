import type { ContextCollector, CollectorRunContext, CollectorResult, MacroRatesContext } from '../../../service/src/ports.js';

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';
const UA = 'trader-agent/session-overview';
// OECD via FRED: Japan Immediate Rates (overnight call rate)
const BOJ_SERIES = 'IRSTCB01JPM156N';

interface FredObs { value: string }
interface FredResponse { observations?: FredObs[] }

export class BojRatesCollector implements ContextCollector<MacroRatesContext> {
  readonly sourceName = 'boj-rates';

  constructor(private readonly fredApiKey: string) {}

  async collect(_ctx: CollectorRunContext): Promise<CollectorResult<MacroRatesContext>> {
    const url = `${FRED_BASE}?series_id=${BOJ_SERIES}&api_key=${this.fredApiKey}&sort_order=desc&limit=1&file_type=json`;
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`FRED BoJ ${BOJ_SERIES}: ${res.status} ${res.statusText}`);

    const json = await res.json() as FredResponse;
    const obs = json.observations ?? [];
    const raw = obs.find((o) => o.value !== '.' && o.value !== '')?.value;
    if (raw === undefined) return { status: 'partial', itemCount: 0 };

    const bojPolicyRate = parseFloat(raw);
    if (isNaN(bojPolicyRate)) return { status: 'partial', itemCount: 0 };

    const data: MacroRatesContext = {
      bojPolicyRate,
      dataDate: new Date().toISOString().slice(0, 10),
    };

    return { status: 'success', data, itemCount: 1 };
  }
}
