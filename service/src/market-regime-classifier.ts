import type { DataStatus, MarketRegime, PrecomputedRegime } from './ports.js';

export type { PrecomputedRegime } from './ports.js';

export type RegimeClassifierInput = {
  btcTone: string;
  btcFourHourStructure: 'bullish' | 'bearish' | 'range' | 'transition' | 'unknown';
  btcWeeklyPosition: 'above_midpoint' | 'at_midpoint' | 'below_midpoint' | null;
  btcDailyPosition: 'above_midpoint' | 'at_midpoint' | 'below_midpoint' | null;
  btcFunding: 'negative_extreme' | 'negative_elevated' | 'neutral' | 'positive_elevated' | 'positive_extreme' | 'unknown';
  btcOiStatus: 'falling' | 'stable' | 'rising' | 'rising_fast' | 'unknown';
  btcPositioning: 'long_heavy' | 'short_heavy' | 'balanced' | 'unknown';
  hasCriticalEvents: boolean;
  dataStatus: DataStatus;
};

export function classifyMarketRegime(input: RegimeClassifierInput): PrecomputedRegime {
  const marketRegime = deriveRegime(input);
  const briefConfidence = deriveConfidence(input);
  return { marketRegime, briefConfidence };
}

function deriveRegime(input: RegimeClassifierInput): MarketRegime {
  const { btcTone, btcFourHourStructure, btcWeeklyPosition, btcFunding, btcOiStatus, btcPositioning, hasCriticalEvents } = input;

  // Bearish breakdown — highest priority directional signal
  if (btcTone === 'bearish_breakdown') {
    if (btcPositioning === 'short_heavy' || btcFunding === 'negative_extreme') return 'risk_off';
    return 'short_heavy_near_support';
  }

  // Bullish breakout
  if (btcTone === 'bullish_breakout') {
    if (btcFunding === 'positive_extreme' || btcPositioning === 'long_heavy') return 'long_heavy_near_resistance';
    return 'risk_on_expansion';
  }

  // Range structure (checked before weaker directional signals)
  if (btcFourHourStructure === 'range') {
    if (btcFunding === 'neutral' && btcPositioning !== 'long_heavy' && btcPositioning !== 'short_heavy') {
      return btcOiStatus === 'falling' ? 'range_compression' : 'defensive_range_bound';
    }
    if (btcPositioning === 'long_heavy') return 'long_heavy_near_resistance';
    if (btcPositioning === 'short_heavy') return 'short_heavy_near_support';
    return 'defensive_range_bound';
  }

  // Constructive (above daily midpoint, not breaking out)
  if (btcTone === 'constructive') {
    const extendedSignal = btcFunding === 'positive_extreme' || btcPositioning === 'long_heavy';
    if (extendedSignal) {
      return btcWeeklyPosition === 'above_midpoint' ? 'long_heavy_near_resistance' : 'constructive_but_extended';
    }
    return 'constructive_but_extended';
  }

  // Weak (below daily midpoint, not breaking down)
  if (btcTone === 'weak') {
    if (btcFunding === 'negative_extreme' || btcPositioning === 'short_heavy') return 'short_heavy_near_support';
    return 'defensive_range_bound';
  }

  // Transition structure with no directional tone → mixed
  if (btcFourHourStructure === 'transition') return 'mixed';

  // Neutral tone with critical upcoming events
  if (hasCriticalEvents && btcTone === 'neutral') return 'event_driven';

  // Neutral with no clear signal
  if (btcTone === 'neutral') return 'defensive_range_bound';

  return 'unknown';
}

function deriveConfidence(input: RegimeClassifierInput): 'low' | 'medium' | 'high' {
  let demerits = 0;

  // Data quality — price failure is critical (no structure = no regime)
  if (input.dataStatus.price === 'failed') demerits += 4;
  if (input.dataStatus.derivatives === 'failed') demerits += 2;
  else if (input.dataStatus.derivatives === 'partial') demerits += 1;

  // Signal quality
  if (input.btcTone === 'unknown') demerits += 2;
  if (input.btcFourHourStructure === 'unknown') demerits += 1;
  if (input.btcFourHourStructure === 'transition') demerits += 2;
  if (input.btcFunding === 'unknown') demerits += 1;
  if (input.btcPositioning === 'unknown') demerits += 1;

  // Conflicting signals — two demerits each because they indicate an unreliable read
  if (input.btcTone === 'constructive' && input.btcFunding === 'negative_extreme') demerits += 2;
  if (input.btcTone === 'weak' && input.btcFunding === 'positive_extreme') demerits += 2;
  if (input.btcTone === 'bullish_breakout' && input.btcPositioning === 'short_heavy') demerits += 2;
  if (input.btcTone === 'bearish_breakdown' && input.btcPositioning === 'long_heavy') demerits += 2;

  if (demerits >= 4) return 'low';
  if (demerits >= 2) return 'medium';
  return 'high';
}
