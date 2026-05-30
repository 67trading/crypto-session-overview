import type { ContextCollector, CollectorRunContext, CollectorResult, MacroRatesContext } from '../../../service/src/ports.js';

const BEA_BASE = 'https://apps.bea.gov/api/data/';
const UA = 'trader-agent/session-overview';

interface BeaDataRow { Year: string; Period: string; DataValue: string; LineNumber: string }
interface BeaResponse {
  BEAAPI?: {
    Results?: {
      Data?: BeaDataRow[];
    };
  };
}

function parseBeaValue(str: string): number | undefined {
  const cleaned = str.replace(/,/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? undefined : n;
}

function latestQuarter(rows: BeaDataRow[], lineNumber: string): number | undefined {
  const filtered = rows
    .filter((r) => r.LineNumber === lineNumber)
    .sort((a, b) => {
      const aKey = `${a.Year}${a.Period}`;
      const bKey = `${b.Year}${b.Period}`;
      return bKey.localeCompare(aKey);
    });
  return filtered.length > 0 ? parseBeaValue(filtered[0]!.DataValue) : undefined;
}

function computeQoQChange(rows: BeaDataRow[], lineNumber: string): number | undefined {
  const filtered = rows
    .filter((r) => r.LineNumber === lineNumber)
    .sort((a, b) => `${b.Year}${b.Period}`.localeCompare(`${a.Year}${a.Period}`));
  if (filtered.length < 2) return undefined;
  const latest = parseBeaValue(filtered[0]!.DataValue);
  const previous = parseBeaValue(filtered[1]!.DataValue);
  if (latest === undefined || previous === undefined || previous === 0) return undefined;
  return parseFloat(((latest - previous) / previous * 100).toFixed(2));
}

async function fetchBeaTable(apiKey: string, tableName: string): Promise<BeaDataRow[]> {
  const params = new URLSearchParams({
    UserID: apiKey,
    method: 'GetData',
    datasetname: 'NIPA',
    TableName: tableName,
    Frequency: 'Q',
    Year: 'LAST5',
    ResultFormat: 'JSON',
  });
  const url = `${BEA_BASE}?${params.toString()}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`BEA ${tableName}: ${res.status} ${res.statusText}`);
  const json = await res.json() as BeaResponse;
  return json.BEAAPI?.Results?.Data ?? [];
}

export class BeaGdpCollector implements ContextCollector<MacroRatesContext> {
  readonly sourceName = 'bea-gdp';

  constructor(private readonly apiKey: string) {}

  async collect(_ctx: CollectorRunContext): Promise<CollectorResult<MacroRatesContext>> {
    const [gdpRows, pceRows] = await Promise.all([
      fetchBeaTable(this.apiKey, 'T10109'),
      fetchBeaTable(this.apiKey, 'T20804'),
    ]);

    if (!Array.isArray(gdpRows) || gdpRows.length === 0) {
      return { status: 'partial', itemCount: 0 };
    }

    // T10109 Line 1 = Percent change in Real GDP
    const gdpGrowthQoQ = latestQuarter(gdpRows, '1');
    if (gdpGrowthQoQ === undefined) {
      return { status: 'partial', itemCount: 0 };
    }

    // T20804 Line 1 = PCE chain-type price index, total
    const pcePriceIndexQoQ = computeQoQChange(pceRows, '1');

    const data: MacroRatesContext = {
      gdpGrowthQoQ,
      ...(pcePriceIndexQoQ !== undefined ? { pcePriceIndexQoQ } : {}),
      dataDate: new Date().toISOString().slice(0, 10),
    };

    return { status: 'success', data, itemCount: 1 };
  }
}
