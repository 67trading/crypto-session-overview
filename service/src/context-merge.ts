import type {
  OverviewInput,
  CollectorResult,
  ContextCollector,
  LiquidityContext,
  EtfFlowContext,
  OptionsContext,
  MacroRatesContext,
  StablecoinContext,
  ChainFlowContext,
  AltsBreadthSummary,
  NormalizedVenueSnapshot,
} from './ports.js';
import type { ContextCollectorEntry } from './service-types.js';

export function mergeLiquidityContext(
  input: OverviewInput,
  result: CollectorResult<LiquidityContext>,
): OverviewInput {
  if (result.data === undefined) return input;
  const existing = input.liquidityContext;
  if (existing === undefined) return { ...input, liquidityContext: result.data };
  // Combine clusters from both sources
  return {
    ...input,
    liquidityContext: {
      clusters: [...existing.clusters, ...result.data.clusters],
      ...(result.data.dataFreshnessSeconds !== undefined
        ? { dataFreshnessSeconds: result.data.dataFreshnessSeconds }
        : existing.dataFreshnessSeconds !== undefined
        ? { dataFreshnessSeconds: existing.dataFreshnessSeconds }
        : {}),
    },
  };
}

export function mergeEtfFlowContext(
  input: OverviewInput,
  result: CollectorResult<EtfFlowContext>,
): OverviewInput {
  if (result.data === undefined) return input;
  const existing = input.etfFlowContext;
  if (existing === undefined) return { ...input, etfFlowContext: result.data };
  const btcFlowUsd = existing.btcFlowUsd ?? result.data.btcFlowUsd;
  const ethFlowUsd = existing.ethFlowUsd ?? result.data.ethFlowUsd;
  // Earlier collectors have priority; later collectors fill missing per-asset fields.
  return {
    ...input,
    etfFlowContext: {
      ...result.data,
      ...existing,
      ...(btcFlowUsd !== undefined ? { btcFlowUsd } : {}),
      ...(ethFlowUsd !== undefined ? { ethFlowUsd } : {}),
      btcSourceAvailable: btcFlowUsd !== undefined,
      ethSourceAvailable: ethFlowUsd !== undefined,
      sourceAvailable: btcFlowUsd !== undefined || ethFlowUsd !== undefined,
      isProxy: existing.isProxy === true && result.data.isProxy === true,
    },
  };
}

export function mergeOptionsContext(
  input: OverviewInput,
  result: CollectorResult<OptionsContext[]>,
): OverviewInput {
  if (result.data === undefined) return input;
  const existing = input.optionsContext ?? [];
  return { ...input, optionsContext: [...existing, ...result.data] };
}

// Deep-merge so multiple collectors (FRED for rates, BEA for GDP/PCE) can each contribute fields
export function mergeMacroRatesContext(
  input: OverviewInput,
  result: CollectorResult<MacroRatesContext>,
): OverviewInput {
  if (result.data === undefined) return input;
  return { ...input, macroRatesContext: { ...input.macroRatesContext, ...result.data } };
}

export function mergeStablecoinContext(
  input: OverviewInput,
  result: CollectorResult<StablecoinContext>,
): OverviewInput {
  if (result.data === undefined) return input;
  return { ...input, stablecoinContext: result.data };
}

export function mergeChainFlowContext(
  input: OverviewInput,
  result: CollectorResult<ChainFlowContext>,
): OverviewInput {
  if (result.data === undefined) return input;
  return { ...input, chainFlowContext: result.data };
}

export function mergeBreadthContext(
  input: OverviewInput,
  result: CollectorResult<AltsBreadthSummary>,
): OverviewInput {
  if (result.data === undefined) return input;
  const existing = input.altsBreadth;
  if (existing === undefined) return { ...input, altsBreadth: result.data };
  // New data fills in additional fields; existing fields take priority
  return { ...input, altsBreadth: { ...result.data, ...existing } };
}

export function mergeNormalizedVenueSnapshots(
  input: OverviewInput,
  result: CollectorResult<NormalizedVenueSnapshot[]>,
): OverviewInput {
  if (result.data === undefined) return input;
  return {
    ...input,
    normalizedVenueSnapshots: [
      ...(input.normalizedVenueSnapshots ?? []),
      ...result.data,
    ],
  };
}

// Type-safe constructor — erases T to unknown so entries can be stored in a plain array.
// TypeScript enforces that collector and merge are compatible at the call site.
export function contextCollectorEntry<T>(
  collector: ContextCollector<T>,
  merge: (input: OverviewInput, result: CollectorResult<T>) => OverviewInput,
): ContextCollectorEntry {
  return {
    collector: collector as ContextCollector<unknown>,
    merge: merge as (input: OverviewInput, result: CollectorResult<unknown>) => OverviewInput,
  };
}
