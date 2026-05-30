import type { ContextCollector, CollectorRunContext, CollectorResult, OptionsContext } from '../../../service/src/ports.js';

const BASE = 'https://www.deribit.com/api/v2/public';
const UA = 'trader-agent/session-overview';

interface DeribitSummary {
  instrument_name: string;
  open_interest: number;
  mark_iv?: number;
  underlying_price?: number;
}

interface DeribitResponse { result?: DeribitSummary[] }

function parseInstrument(name: string): { expiry: string; strike: number; type: 'C' | 'P' } | null {
  const parts = name.split('-');
  if (parts.length < 4) return null;
  const strike = parseInt(parts[2] ?? '', 10);
  const type = parts[3];
  if (isNaN(strike) || (type !== 'C' && type !== 'P')) return null;
  return { expiry: parts[1] ?? '', strike, type };
}

function computePcr(summaries: DeribitSummary[]): number | undefined {
  let callsOI = 0;
  let putsOI = 0;
  for (const s of summaries) {
    const parsed = parseInstrument(s.instrument_name);
    if (parsed === null) continue;
    if (parsed.type === 'C') callsOI += s.open_interest;
    else putsOI += s.open_interest;
  }
  if (callsOI === 0) return undefined;
  return parseFloat((putsOI / callsOI).toFixed(3));
}

function computeAtmIv(summaries: DeribitSummary[]): number | undefined {
  const spot = summaries.find((s) => s.underlying_price !== undefined)?.underlying_price;
  if (spot === undefined) return undefined;

  // Sort expiries, take front-week; find ATM call
  const instruments = summaries
    .map((s) => ({ ...s, parsed: parseInstrument(s.instrument_name) }))
    .filter((s): s is typeof s & { parsed: NonNullable<typeof s.parsed> } => s.parsed !== null);

  const expiries = [...new Set(instruments.map((i) => i.parsed.expiry))].sort();
  const frontExpiry = expiries[0];
  if (frontExpiry === undefined) return undefined;

  const frontCalls = instruments.filter((i) => i.parsed.expiry === frontExpiry && i.parsed.type === 'C');
  if (frontCalls.length === 0) return undefined;

  const atm = frontCalls.reduce((best, curr) =>
    Math.abs(curr.parsed.strike - spot) < Math.abs(best.parsed.strike - spot) ? curr : best,
  );

  return atm.mark_iv !== undefined ? parseFloat(atm.mark_iv.toFixed(1)) : undefined;
}

function computeMaxPain(summaries: DeribitSummary[]): number | undefined {
  const instruments = summaries
    .map((s) => ({ ...s, parsed: parseInstrument(s.instrument_name) }))
    .filter((s): s is typeof s & { parsed: NonNullable<typeof s.parsed> } => s.parsed !== null);

  const strikes = [...new Set(instruments.map((i) => i.parsed.strike))].sort((a, b) => a - b);
  if (strikes.length === 0) return undefined;

  let minPain = Infinity;
  let maxPainStrike = strikes[0]!;

  for (const candidate of strikes) {
    let pain = 0;
    for (const inst of instruments) {
      const { strike, type } = inst.parsed;
      const oi = inst.open_interest;
      if (type === 'C') pain += oi * Math.max(0, candidate - strike);
      else pain += oi * Math.max(0, strike - candidate);
    }
    if (pain < minPain) { minPain = pain; maxPainStrike = candidate; }
  }

  return maxPainStrike;
}

export class DeribitOptionsCollector implements ContextCollector<OptionsContext[]> {
  readonly sourceName = 'deribit-options';

  async collect(_ctx: CollectorRunContext): Promise<CollectorResult<OptionsContext[]>> {
    const [btcRes, ethRes] = await Promise.allSettled([
      this.fetchCurrency('BTC'),
      this.fetchCurrency('ETH'),
    ]);

    const data: OptionsContext[] = [];
    for (const res of [btcRes, ethRes]) {
      if (res.status === 'fulfilled' && res.value !== null) {
        data.push(res.value);
      }
    }

    if (data.length === 0) return { status: 'partial', itemCount: 0 };
    return { status: 'success', data, itemCount: data.length };
  }

  private async fetchCurrency(currency: 'BTC' | 'ETH'): Promise<OptionsContext | null> {
    const url = `${BASE}/get_book_summary_by_currency?currency=${currency}&kind=option`;
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`Deribit options ${currency}: ${res.status} ${res.statusText}`);

    const json = await res.json() as DeribitResponse;
    const summaries = json.result ?? [];
    if (summaries.length === 0) return null;

    const putCallRatio = computePcr(summaries);
    const impliedVol24h = computeAtmIv(summaries);
    const maxPainStrike = computeMaxPain(summaries);

    return {
      symbol: currency,
      ...(putCallRatio !== undefined ? { putCallRatio } : {}),
      ...(impliedVol24h !== undefined ? { impliedVol24h } : {}),
      ...(maxPainStrike !== undefined ? { maxPainStrike } : {}),
    };
  }
}
