import type {
  AltsBreadthSummary,
  CollectorResult,
  CollectorRunContext,
  ContextCollector,
} from '../../../service/src/ports.js';

const API_URL =
  'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&price_change_percentage=24h&sparkline=false';

interface CoinGeckoMarketItem {
  id: string;
  symbol: string;
  price_change_percentage_24h: number | null;
}

function breadthLabel(breadthPercent: number): string {
  if (breadthPercent >= 70) return 'strong breadth';
  if (breadthPercent >= 55) return 'moderate breadth';
  if (breadthPercent >= 40) return 'mixed';
  if (breadthPercent >= 25) return 'weak breadth';
  return 'very weak breadth';
}

function rotationState(
  breadthPercent: number,
): AltsBreadthSummary['rotationState'] {
  if (breadthPercent >= 70) return 'broad_rotation';
  if (breadthPercent >= 55) return 'selective_rotation';
  if (breadthPercent >= 40) return 'weak';
  return 'no_rotation';
}

export class CoinGeckoBreadthCollector
  implements ContextCollector<AltsBreadthSummary>
{
  readonly sourceName = 'coingecko-breadth';

  async collect(
    _ctx: CollectorRunContext,
  ): Promise<CollectorResult<AltsBreadthSummary>> {
    const response = await fetch(API_URL, {
      headers: { 'User-Agent': 'trader-agent/session-overview' },
    });

    if (!response.ok) {
      throw new Error(
        `CoinGecko markets fetch failed: ${response.status} ${response.statusText}`,
      );
    }

    const body = (await response.json()) as CoinGeckoMarketItem[];

    if (body.length === 0) {
      return { status: 'partial', itemCount: 0 };
    }

    const withChange = body.filter(
      (c) => c.price_change_percentage_24h !== null,
    );

    const totalTracked = withChange.length;
    const positiveCount = withChange.filter(
      (c) => (c.price_change_percentage_24h as number) > 0,
    ).length;
    const breadthPercent =
      totalTracked > 0 ? (positiveCount / totalTracked) * 100 : 0;

    const btcCoin = body.find((c) => c.id === 'bitcoin');
    let outperformingBtcPct: number | undefined;
    if (btcCoin?.price_change_percentage_24h !== null && btcCoin !== undefined) {
      const btcChange = btcCoin.price_change_percentage_24h as number;
      const outperformingBtc = withChange.filter(
        (c) => c.id !== 'bitcoin' && (c.price_change_percentage_24h as number) > btcChange,
      ).length;
      const altsTracked = withChange.filter((c) => c.id !== 'bitcoin').length;
      outperformingBtcPct = altsTracked > 0 ? parseFloat(((outperformingBtc / altsTracked) * 100).toFixed(1)) : 0;
    }

    const data: AltsBreadthSummary = {
      breadthPercent,
      positiveCount,
      totalTracked,
      breadthLabel: breadthLabel(breadthPercent),
      rotationState: rotationState(breadthPercent),
      ...(outperformingBtcPct !== undefined ? { outperformingBtcPct } : {}),
    };

    return { status: 'success', data, itemCount: totalTracked };
  }
}
