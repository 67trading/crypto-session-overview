import type { DerivativesCollector, DerivativesContext } from '../../../service/src/ports.js';
import type { BybitHttpClient } from '../bybit-http-client.js';

type FundingStatus = DerivativesContext['fundingStatus'];
type OiStatus = DerivativesContext['oiStatus'];
type PositioningStatus = DerivativesContext['positioningStatus'];

function deriveFundingStatus(fundingRate: number): FundingStatus {
  if (fundingRate < -0.0005) return 'negative_extreme';
  if (fundingRate < -0.0001) return 'negative_elevated';
  if (fundingRate > 0.0005) return 'positive_extreme';
  if (fundingRate > 0.0001) return 'positive_elevated';
  return 'neutral';
}

function deriveOiStatus(list: Array<{ openInterest: number }>): OiStatus {
  if (list.length < 2) return 'stable';
  const latest = list[0]?.openInterest;
  const prior = list[1]?.openInterest;
  if (latest === undefined || prior === undefined) return 'stable';
  if (prior === 0) return 'stable';
  const changePct = (latest - prior) / prior;
  if (changePct > 0.05) return 'rising_fast';
  if (changePct > 0.01) return 'rising';
  if (changePct < -0.01) return 'falling';
  return 'stable';
}

function derivePositioningStatus(fundingStatus: FundingStatus): PositioningStatus {
  if (fundingStatus === 'negative_extreme' || fundingStatus === 'negative_elevated') {
    return 'short_heavy';
  }
  if (fundingStatus === 'positive_extreme' || fundingStatus === 'positive_elevated') {
    return 'long_heavy';
  }
  return 'balanced';
}

export class BybitDerivativesCollector implements DerivativesCollector {
  constructor(private readonly client: BybitHttpClient) {}

  async collect(symbols: string[]): Promise<Record<string, DerivativesContext>> {
    const results = await Promise.allSettled(
      symbols.map((symbol) => this.collectOne(symbol)),
    );

    const record: Record<string, DerivativesContext> = {};
    for (let i = 0; i < symbols.length; i++) {
      const result = results[i];
      const symbol = symbols[i];
      if (result !== undefined && symbol !== undefined) {
        if (result.status === 'fulfilled') {
          record[symbol] = result.value;
        } else {
          record[symbol] = {
            symbol,
            fundingStatus: 'unknown',
            oiStatus: 'unknown',
            positioningStatus: 'unknown',
          };
        }
      }
    }
    return record;
  }

  private async collectOne(symbol: string): Promise<DerivativesContext> {
    // Use perpetual symbol for derivatives (append USDT if not already)
    const perpSymbol = symbol.endsWith('USDT') ? symbol : `${symbol}USDT`;

    const [fundingHistory, oiHistory] = await Promise.all([
      this.client.getFundingRateHistory(perpSymbol, 10),
      this.client.getOpenInterest(perpSymbol, '1d'),
    ]);

    const latestFunding = fundingHistory[0]?.fundingRate ?? 0;
    const fundingStatus = deriveFundingStatus(latestFunding);
    const oiStatus = deriveOiStatus(oiHistory);
    const positioningStatus = derivePositioningStatus(fundingStatus);

    return {
      symbol,
      fundingStatus,
      oiStatus,
      positioningStatus,
    };
  }
}
