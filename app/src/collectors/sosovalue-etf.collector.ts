import type { ContextCollector, CollectorRunContext, CollectorResult, EtfFlowContext } from '../../../service/src/ports.js';

const API_URL = 'https://api.sosovalue.xyz/openapi/v2/etf/historicalInflowChart';
const UA = 'trader-agent/session-overview';

type EtfAsset = 'BTC' | 'ETH';
type FlowRow = { date?: unknown; totalNetInflow?: unknown };

function parseNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function rowsFrom(body: unknown): FlowRow[] {
  const data = (body as { data?: unknown }).data;
  if (Array.isArray(data)) return data as FlowRow[];
  const list = (data as { list?: unknown } | undefined)?.list;
  if (Array.isArray(list)) return list as FlowRow[];
  return [];
}

function latestRow(rows: FlowRow[]): FlowRow | undefined {
  return rows
    .filter((row) => typeof row.date === 'string')
    .sort((a, b) => {
      const aTs = Date.parse(String(a.date));
      const bTs = Date.parse(String(b.date));
      if (!Number.isNaN(aTs) && !Number.isNaN(bTs)) return bTs - aTs;
      if (!Number.isNaN(aTs)) return -1;
      if (!Number.isNaN(bTs)) return 1;
      return String(b.date).localeCompare(String(a.date));
    })[0];
}

async function fetchAsset(asset: EtfAsset): Promise<{ asset: EtfAsset; date: string; flowUsd: number }> {
  const type = asset === 'BTC' ? 'us-btc-spot' : 'us-eth-spot';
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ type }),
  });

  if (!response.ok) throw new Error(`${asset}: ${response.status} ${response.statusText}`);

  let body: unknown;
  try {
    body = await response.json();
  } catch (err) {
    throw new Error(`${asset}: JSON parse failed: ${String(err)}`);
  }

  const code = (body as { code?: unknown }).code;
  if (code !== undefined && code !== 0) {
    throw new Error(`${asset}: SoSoValue code=${String(code)}`);
  }

  const row = latestRow(rowsFrom(body));
  const date = typeof row?.date === 'string' ? row.date : undefined;
  const flowUsd = parseNumber(row?.totalNetInflow);
  if (date === undefined || flowUsd === undefined) {
    throw new Error(`${asset}: missing latest totalNetInflow row`);
  }

  return { asset, date, flowUsd };
}

export class SoSoValueEtfCollector implements ContextCollector<EtfFlowContext> {
  readonly sourceName = 'sosovalue-etf';

  async collect(_ctx: CollectorRunContext): Promise<CollectorResult<EtfFlowContext>> {
    const [btc, eth] = await Promise.allSettled([fetchAsset('BTC'), fetchAsset('ETH')]);
    const btcValue = btc.status === 'fulfilled' ? btc.value : undefined;
    const ethValue = eth.status === 'fulfilled' ? eth.value : undefined;
    const errors = [
      ...(btc.status === 'rejected' ? [String(btc.reason)] : []),
      ...(eth.status === 'rejected' ? [String(eth.reason)] : []),
    ];

    if (btcValue === undefined && ethValue === undefined) {
      const accessLimited = errors.some((err) => /\b(401|402|403|429)\b/.test(err));
      const transient = errors.some((err) => /\b5\d\d\b/.test(err) || /fetch failed|network/i.test(err));
      return {
        status: transient ? 'failed' : 'skipped',
        itemCount: 0,
        reasonCode: transient ? 'TRANSIENT_NETWORK_ERROR' : accessLimited ? 'ACCESS_LIMITED' : 'PARSER_ERROR',
        error: errors.join('; '),
      };
    }

    const date = [btcValue?.date, ethValue?.date].filter((v): v is string => v !== undefined).sort().reverse()[0]!;
    const data: EtfFlowContext = {
      ...(btcValue !== undefined ? { btcFlowUsd: btcValue.flowUsd, btcSourceAvailable: true } : { btcSourceAvailable: false }),
      ...(ethValue !== undefined ? { ethFlowUsd: ethValue.flowUsd, ethSourceAvailable: true } : { ethSourceAvailable: false }),
      date,
      source: 'sosovalue',
      sourceAvailable: true,
      isProxy: false,
    };

    return {
      status: errors.length > 0 ? 'partial' : 'success',
      data,
      itemCount: [btcValue, ethValue].filter((v) => v !== undefined).length,
      source: 'sosovalue',
      ...(errors.length > 0 ? { error: errors.join('; '), reasonCode: errors.some((err) => /\b5\d\d\b/.test(err) || /fetch failed|network/i.test(err)) ? 'TRANSIENT_NETWORK_ERROR' as const : 'PARSER_ERROR' as const } : {}),
    };
  }
}
