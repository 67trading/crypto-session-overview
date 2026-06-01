import type { OverviewInput, SourceHealthSummary } from './ports.js';

export const PRODUCT_FOOTER_NOTE =
  'This is market context only. No entries, exits, position sizing or leverage.';

export type PresentationContext = {
  etfNarrative: {
    sourceAvailable: boolean;
    claimAllowed: boolean;
    proxyOnly: boolean;
    bullets: string[];
  };
  optionsNarrative: {
    sourceAvailable: boolean;
    claimAllowed: boolean;
    bullets: string[];
  };
  macroNarrative: {
    sourceAvailable: boolean;
    strongClaimAllowed: boolean;
    bullets: string[];
  };
};

function sourceSucceeded(sourceHealth: SourceHealthSummary | undefined, name: string): boolean {
  return sourceHealth?.collectors.some((collector) =>
    (collector.name === name || collector.source === name)
    && (collector.status === 'success' || collector.status === 'partial')
    && collector.itemCount > 0
  ) === true;
}

function hasQuotaLimitedSource(sourceHealth: SourceHealthSummary | undefined, name: string): boolean {
  return sourceHealth?.collectors.some((collector) =>
    (collector.name === name || collector.source === name)
    && (collector.status === 'partial' || collector.status === 'skipped')
    && collector.reasonCode === 'ACCESS_LIMITED_QUOTA'
  ) === true;
}

function formatUsd(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  return `${value.toFixed(0)}`;
}

export function buildPresentationContext(input: OverviewInput): PresentationContext {
  const etfBullets: string[] = [];
  const etf = input.etfFlowContext;
  const hasEtfFlow = etf?.sourceAvailable === true
    && (etf.btcFlowUsd !== undefined || etf.ethFlowUsd !== undefined);
  const proxyOnly = etf?.isProxy === true;
  if (hasEtfFlow && etf !== undefined) {
    const prefix = proxyOnly ? 'ETF holdings proxy suggests' : 'ETF flows show';
    if (etf.btcFlowUsd !== undefined) {
      etfBullets.push(`${prefix} BTC ${formatUsd(etf.btcFlowUsd)} USD on ${etf.date}.`);
    }
    if (etf.ethFlowUsd !== undefined) {
      etfBullets.push(`${prefix} ETH ${formatUsd(etf.ethFlowUsd)} USD on ${etf.date}.`);
    }
  } else {
    etfBullets.push('ETF flow context is unavailable from configured free sources.');
  }

  const optionsBullets: string[] = [];
  const hasDeribitOptions = sourceSucceeded(input.sourceHealth, 'deribit-options')
    && (input.optionsContext?.length ?? 0) > 0;
  if (hasDeribitOptions && input.optionsContext !== undefined) {
    for (const option of input.optionsContext) {
      const parts: string[] = [];
      if (option.maxPainStrike !== undefined) parts.push(`max pain ${option.maxPainStrike}`);
      if (option.putCallRatio !== undefined) parts.push(`put/call ${option.putCallRatio}`);
      if (option.impliedVol24h !== undefined) parts.push(`ATM IV ${option.impliedVol24h}%`);
      if (parts.length > 0) optionsBullets.push(`Deribit ${option.symbol} options context: ${parts.join(', ')}.`);
    }
  }
  if (optionsBullets.length === 0) {
    optionsBullets.push('Deribit options context is unavailable for this session.');
  }

  const macroBullets: string[] = [];
  const macro = input.macroRatesContext;
  const fredLimited = hasQuotaLimitedSource(input.sourceHealth, 'fred-rates');
  const bojLimited = hasQuotaLimitedSource(input.sourceHealth, 'boj-rates');
  if (fredLimited || bojLimited) {
    macroBullets.push('Macro rates context is incomplete because key FRED/BoJ series were rate-limited.');
  } else if (macro !== undefined) {
    if (macro.pceYoY !== undefined) macroBullets.push(`US PCE context: ${macro.pceYoY}% YoY.`);
    if (macro.gdpGrowthQoQ !== undefined) macroBullets.push(`US GDP context: ${macro.gdpGrowthQoQ}% QoQ.`);
    if (macro.ecbDepositRate !== undefined) macroBullets.push(`ECB deposit rate context: ${macro.ecbDepositRate}%.`);
    if (macro.eurozoneHicpYoY !== undefined) macroBullets.push(`Eurozone HICP context: ${macro.eurozoneHicpYoY}% YoY.`);
  }
  if (macroBullets.length === 0) {
    macroBullets.push('Macro rates context is unavailable from configured sources.');
  }

  return {
    etfNarrative: {
      sourceAvailable: hasEtfFlow,
      claimAllowed: hasEtfFlow,
      proxyOnly,
      bullets: etfBullets,
    },
    optionsNarrative: {
      sourceAvailable: hasDeribitOptions,
      claimAllowed: hasDeribitOptions,
      bullets: optionsBullets,
    },
    macroNarrative: {
      sourceAvailable: macro !== undefined,
      strongClaimAllowed: !fredLimited && !bojLimited,
      bullets: macroBullets,
    },
  };
}
