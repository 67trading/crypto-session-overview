import type { ContextCollector, CollectorRunContext, CollectorResult, MacroRatesContext } from '../../../service/src/ports.js';

const UA = 'trader-agent/session-overview';
// HICP monthly, annual rate of change — Euro Area, all items
const EUROSTAT_URL =
  'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_manr?geo=EA&coicop=CP00&lastTimePeriod=2&format=JSON';

interface EurostatDimCategory {
  index: Record<string, number>;
}
interface EurostatJson {
  value?: Record<string, number>;
  dimension?: {
    time?: { category?: EurostatDimCategory };
  };
}

function latestValue(json: EurostatJson): number | undefined {
  const timeCat = json.dimension?.time?.category;
  if (timeCat === undefined || json.value === undefined) return undefined;

  // Find the time period with the highest sort-order (most recent month key e.g. "2025-01")
  const timeKeys = Object.keys(timeCat.index).sort();
  if (timeKeys.length === 0) return undefined;

  const latestKey = timeKeys[timeKeys.length - 1]!;
  const posIdx = timeCat.index[latestKey];
  if (posIdx === undefined) return undefined;

  const val = json.value[posIdx.toString()];
  return val === undefined ? undefined : val;
}

export class EurostatInflationCollector implements ContextCollector<MacroRatesContext> {
  readonly sourceName = 'eurostat-inflation';

  async collect(_ctx: CollectorRunContext): Promise<CollectorResult<MacroRatesContext>> {
    const res = await fetch(EUROSTAT_URL, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`Eurostat HICP: ${res.status} ${res.statusText}`);

    const json = await res.json() as EurostatJson;
    const eurozoneHicpYoY = latestValue(json);

    if (eurozoneHicpYoY === undefined) return { status: 'partial', itemCount: 0 };

    const data: MacroRatesContext = {
      eurozoneHicpYoY,
      dataDate: new Date().toISOString().slice(0, 10),
    };

    return { status: 'success', data, itemCount: 1 };
  }
}
