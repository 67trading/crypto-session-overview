import type { ContextCollector, CollectorRunContext, CollectorResult, EtfFlowContext } from '../../../service/src/ports.js';

const BTC_URL = 'https://farside.co.uk/bitcoin-etf-flow-all-data/';
const ETH_URL = 'https://farside.co.uk/ethereum-etf-flow-all-data/';
const UA = 'trader-agent/session-overview';

const DATE_RE = /^\d{1,2}\/\d{1,2}\/\d{4}$/;

function parseFarsideValue(raw: string): number | null {
  const trimmed = raw.trim().replace(/,/g, '');
  if (trimmed === '' || trimmed === '-' || trimmed === 'N/A') return null;
  const isNegative = trimmed.startsWith('(') && trimmed.endsWith(')');
  const numeric = trimmed.replace(/[()]/g, '');
  const value = parseFloat(numeric);
  if (isNaN(value)) return null;
  return isNegative ? -value : value;
}

function extractCells(trHtml: string): string[] {
  const cells: string[] = [];
  const re = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(trHtml)) !== null) {
    // Strip any inner tags and decode basic entities
    const text = (m[1] ?? '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
    cells.push(text);
  }
  return cells;
}

function latestDailyFlowMillions(html: string): number | undefined {
  const trRe = /<tr[\s\S]*?<\/tr>/gi;
  let lastDataRow: string[] | undefined;

  let m: RegExpExecArray | null;
  while ((m = trRe.exec(html)) !== null) {
    const cells = extractCells(m[0]);
    if (cells.length < 2) continue;
    if (!DATE_RE.test(cells[0] ?? '')) continue;
    // Find last numeric cell (Total column)
    const lastNumeric = cells.slice(1).reverse().find((c) => parseFarsideValue(c) !== null);
    if (lastNumeric !== undefined) lastDataRow = cells;
  }

  if (lastDataRow === undefined) return undefined;
  const lastNumeric = lastDataRow.slice(1).reverse().find((c) => parseFarsideValue(c) !== null);
  return lastNumeric !== undefined ? (parseFarsideValue(lastNumeric) ?? undefined) : undefined;
}

async function fetchFlow(url: string): Promise<number | undefined> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Farside fetch ${url}: ${res.status} ${res.statusText}`);
  const html = await res.text();
  return latestDailyFlowMillions(html);
}

export class FarsideEtfCollector implements ContextCollector<EtfFlowContext> {
  readonly sourceName = 'farside-etf';

  async collect(_ctx: CollectorRunContext): Promise<CollectorResult<EtfFlowContext>> {
    const [btcMillions, ethMillions] = await Promise.all([
      fetchFlow(BTC_URL).catch(() => undefined),
      fetchFlow(ETH_URL).catch(() => undefined),
    ]);

    if (btcMillions === undefined && ethMillions === undefined) {
      return { status: 'partial', itemCount: 0 };
    }

    const MILLION = 1_000_000;
    const data: EtfFlowContext = {
      ...(btcMillions !== undefined ? { btcFlowUsd: btcMillions * MILLION } : {}),
      ...(ethMillions !== undefined ? { ethFlowUsd: ethMillions * MILLION } : {}),
      date: new Date().toISOString().slice(0, 10),
      source: 'farside',
    };

    return {
      status: btcMillions !== undefined ? 'success' : 'partial',
      data,
      itemCount: [btcMillions, ethMillions].filter((v) => v !== undefined).length,
    };
  }
}
