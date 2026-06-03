import type { Venue } from '../ports.js';

export type InstrumentRegistryEntry = {
  asset: 'BTC' | 'ETH' | 'SOL' | 'XRP' | 'BNB' | 'DOGE' | 'ADA' | 'LINK';
  canonical: string;
  venues: Partial<Record<Exclude<Venue, 'deribit'>, string>>;
  enabledFor: Array<'price' | 'funding' | 'oi' | 'alts_breadth'>;
};

export const INSTRUMENTS: InstrumentRegistryEntry[] = [
  {
    asset: 'BTC',
    canonical: 'BTC-PERP-USDT',
    venues: { bybit: 'BTCUSDT', binance: 'BTCUSDT', okx: 'BTC-USDT-SWAP' },
    enabledFor: ['price', 'funding', 'oi'],
  },
  {
    asset: 'ETH',
    canonical: 'ETH-PERP-USDT',
    venues: { bybit: 'ETHUSDT', binance: 'ETHUSDT', okx: 'ETH-USDT-SWAP' },
    enabledFor: ['price', 'funding', 'oi'],
  },
  { asset: 'SOL', canonical: 'SOL-PERP-USDT', venues: { bybit: 'SOLUSDT', binance: 'SOLUSDT', okx: 'SOL-USDT-SWAP' }, enabledFor: ['alts_breadth'] },
  { asset: 'XRP', canonical: 'XRP-PERP-USDT', venues: { bybit: 'XRPUSDT', binance: 'XRPUSDT', okx: 'XRP-USDT-SWAP' }, enabledFor: ['alts_breadth'] },
  { asset: 'BNB', canonical: 'BNB-PERP-USDT', venues: { bybit: 'BNBUSDT', binance: 'BNBUSDT' }, enabledFor: ['alts_breadth'] },
  { asset: 'DOGE', canonical: 'DOGE-PERP-USDT', venues: { bybit: 'DOGEUSDT', binance: 'DOGEUSDT', okx: 'DOGE-USDT-SWAP' }, enabledFor: ['alts_breadth'] },
  { asset: 'ADA', canonical: 'ADA-PERP-USDT', venues: { bybit: 'ADAUSDT', binance: 'ADAUSDT', okx: 'ADA-USDT-SWAP' }, enabledFor: ['alts_breadth'] },
  { asset: 'LINK', canonical: 'LINK-PERP-USDT', venues: { bybit: 'LINKUSDT', binance: 'LINKUSDT', okx: 'LINK-USDT-SWAP' }, enabledFor: ['alts_breadth'] },
];

export function getInstrumentByVenueSymbol(venue: Exclude<Venue, 'deribit'>, symbol: string): InstrumentRegistryEntry | undefined {
  return INSTRUMENTS.find((entry) => entry.venues[venue] === symbol);
}

export function getInstrumentsFor(feature: InstrumentRegistryEntry['enabledFor'][number]): InstrumentRegistryEntry[] {
  return INSTRUMENTS.filter((entry) => entry.enabledFor.includes(feature));
}
