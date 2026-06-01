import type { ContextCollector, CollectorRunContext, CollectorResult, EtfFlowContext } from '../../../service/src/ports.js';

export class IssuerHoldingsProxyCollector implements ContextCollector<EtfFlowContext> {
  readonly sourceName = 'issuer-holdings-proxy';

  async collect(_ctx: CollectorRunContext): Promise<CollectorResult<EtfFlowContext>> {
    return {
      status: 'skipped',
      itemCount: 0,
      reasonCode: 'NO_STABLE_API',
      error: 'Issuer holdings proxy is not configured with stable issuer endpoints yet',
    };
  }
}
