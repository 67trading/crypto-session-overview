import type { ContextCollector, CollectorRunContext, CollectorResult, MacroRatesContext } from '../../../service/src/ports.js';

const UA = 'trader-agent/session-overview';
const ECB_BASE = 'https://data-api.ecb.europa.eu/service/data';

// SDMX-JSON: dataSets[0].series[<key>].observations[<obsIdx>][0]
interface SdmxObservation { [obsIdx: string]: [number, ...unknown[]] }
interface SdmxSeries { observations: SdmxObservation }
interface SdmxDataSet { series: Record<string, SdmxSeries> }
interface SdmxJson { dataSets?: SdmxDataSet[] }

async function fetchEcbRate(seriesKey: string): Promise<number | undefined> {
  const url = `${ECB_BASE}/${seriesKey}?lastNObservations=1`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
  });
  if (!res.ok) throw new Error(`ECB ${seriesKey}: ${res.status} ${res.statusText}`);

  const json = await res.json() as SdmxJson;
  const dataSet = json.dataSets?.[0];
  if (dataSet === undefined) return undefined;

  const seriesKeys = Object.keys(dataSet.series);
  if (seriesKeys.length === 0) return undefined;

  const series = dataSet.series[seriesKeys[0]!]!;
  const obsKeys = Object.keys(series.observations).sort((a, b) => parseInt(b) - parseInt(a));
  if (obsKeys.length === 0) return undefined;

  return series.observations[obsKeys[0]!]![0];
}

export class EcbRatesCollector implements ContextCollector<MacroRatesContext> {
  readonly sourceName = 'ecb-rates';

  async collect(_ctx: CollectorRunContext): Promise<CollectorResult<MacroRatesContext>> {
    const [ecbDepositRate, ecbMainRate] = await Promise.all([
      fetchEcbRate('FM/B.U2.EUR.4F.KR.DFR.LEV'),
      fetchEcbRate('FM/B.U2.EUR.4F.KR.MRR_FR.LEV'),
    ]);

    const fieldCount = [ecbDepositRate, ecbMainRate].filter((v) => v !== undefined).length;
    if (fieldCount === 0) return { status: 'partial', itemCount: 0 };

    const data: MacroRatesContext = {
      ...(ecbDepositRate !== undefined ? { ecbDepositRate } : {}),
      ...(ecbMainRate !== undefined ? { ecbMainRate } : {}),
      dataDate: new Date().toISOString().slice(0, 10),
    };

    return { status: 'success', data, itemCount: fieldCount };
  }
}
