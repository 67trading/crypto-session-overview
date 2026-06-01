import type { ContextCollector, CollectorRunContext, CollectorResult, EtfFlowContext } from '../../../service/src/ports.js';

export class CoinMarketCapEtfCollector implements ContextCollector<EtfFlowContext> {
  readonly sourceName = 'coinmarketcap-etf';

  async collect(_ctx: CollectorRunContext): Promise<CollectorResult<EtfFlowContext>> {
    return {
      status: 'skipped',
      itemCount: 0,
      reasonCode: 'NO_STABLE_API',
      error: 'No stable free machine-readable CoinMarketCap ETF payload is configured',
    };
  }
}
