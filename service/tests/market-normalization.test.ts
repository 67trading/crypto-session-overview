import { describe, expect, it } from 'vitest';
import { getInstrumentByVenueSymbol, getInstrumentsFor } from '../src/market-normalization/instrument-registry.js';
import { normalizeFundingPer8h } from '../src/market-normalization/normalize-funding.js';
import { normalizeOiUsd } from '../src/market-normalization/normalize-open-interest.js';

describe('market normalization helpers', () => {
  it('maps venue symbols to canonical instruments', () => {
    expect(getInstrumentByVenueSymbol('okx', 'BTC-USDT-SWAP')?.canonical).toBe('BTC-PERP-USDT');
    expect(getInstrumentByVenueSymbol('binance', 'ETHUSDT')?.asset).toBe('ETH');
    expect(getInstrumentsFor('price').map((entry) => entry.asset)).toEqual(['BTC', 'ETH']);
  });

  it('normalizes funding to an 8h basis', () => {
    expect(normalizeFundingPer8h(0.0003, 8)).toBe(0.0003);
    expect(normalizeFundingPer8h(0.0003, 4)).toBe(0.0006);
    expect(normalizeFundingPer8h(0.0003, 0)).toBeUndefined();
  });

  it('normalizes open interest into USD where enough metadata exists', () => {
    expect(normalizeOiUsd({ rawValue: 10, rawUnit: 'base', markPrice: 65000 })).toBe(650000);
    expect(normalizeOiUsd({ rawValue: 500000, rawUnit: 'usd' })).toBe(500000);
    expect(normalizeOiUsd({ rawValue: 10, rawUnit: 'contracts', contractSize: 0.001, markPrice: 65000 })).toBe(650);
    expect(normalizeOiUsd({ rawValue: 10, rawUnit: 'contracts' })).toBeUndefined();
  });
});
