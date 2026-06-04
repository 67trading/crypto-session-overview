import { describe, it, expect } from 'vitest';
import { computeWhatChanged, firstBriefBullets } from '../src/brief-diff-engine.js';
import type { OverviewOutput } from '../src/ports.js';

function makeOutput(overrides: Partial<OverviewOutput> = {}): OverviewOutput {
  return {
    briefId: 'brief-test-1',
    generatedAtUtc: '2026-01-01T00:00:00Z',
    session: 'US_CRYPTO',
    marketRegime: 'constructive_but_extended',
    briefConfidence: 'medium',
    dataStatus: { price: 'fresh', events: 'fresh', derivatives: 'fresh', liquidations: 'unavailable' },
    whatChanged: ['No previous brief available for this session — initial reading.'],
    btc: { summary: 'BTC near resistance.', keyLevels: ['97000'], position: 'above daily midpoint', structure: 'bullish' },
    eth: { summary: 'ETH in line with BTC.', vsbtc: 'in_line', keyLevels: ['3200'] },
    majorAssets: [],
    alts: { summary: 'Alts quiet.', rotationState: 'selective_rotation', breadth: '55% green' },
    derivatives: { summary: 'Neutral.', funding: 'neutral', oi: 'stable', positioning: 'balanced' },
    liquidity: { bullets: ['No significant liquidity clusters identified.'] },
    events: { summary: 'Light calendar.', upcoming: [{ title: 'CPI Release', time: '2026-01-02T13:30:00Z', importance: 'critical' }] },
    scenarios: { reclaim: 'Breakout continuation.', rejection: 'Pullback to support.', chop: 'Range persists.' },
    note: 'No caveats.',
    ...overrides,
  };
}

describe('firstBriefBullets()', () => {
  it('returns the standard no-previous-brief message', () => {
    const result = firstBriefBullets();
    expect(result).toEqual(['No previous brief available for this session — initial reading.']);
  });
});

describe('computeWhatChanged()', () => {
  it('returns no-changes fallback when nothing differs', () => {
    const base = makeOutput();
    const result = computeWhatChanged(base, makeOutput());
    expect(result).toEqual(['No significant structural changes since previous brief.']);
  });

  it('detects marketRegime change', () => {
    const prev = makeOutput({ marketRegime: 'constructive_but_extended' });
    const curr = makeOutput({ marketRegime: 'risk_off' });
    const result = computeWhatChanged(prev, curr);
    expect(result).toContain('Regime: constructive but extended → risk off');
  });

  it('detects briefConfidence change', () => {
    const prev = makeOutput({ briefConfidence: 'medium' });
    const curr = makeOutput({ briefConfidence: 'high' });
    const result = computeWhatChanged(prev, curr);
    expect(result).toContain('Confidence: medium → high');
  });

  it('detects btc structure change', () => {
    const prev = makeOutput({ btc: { ...makeOutput().btc, structure: 'bullish' } });
    const curr = makeOutput({ btc: { ...makeOutput().btc, structure: 'bearish' } });
    const result = computeWhatChanged(prev, curr);
    expect(result).toContain('BTC 4H structure: bullish → bearish');
  });

  it('detects alts rotation state change', () => {
    const prev = makeOutput({ alts: { ...makeOutput().alts, rotationState: 'selective_rotation' } });
    const curr = makeOutput({ alts: { ...makeOutput().alts, rotationState: 'no_rotation' } });
    const result = computeWhatChanged(prev, curr);
    expect(result).toContain('Alts breadth: selective rotation → broad perp weakness');
    expect(result.join(' ')).not.toContain('no rotation');
    expect(result.join(' ')).not.toContain('Alt rotation');
  });

  it('detects new upcoming event', () => {
    const prev = makeOutput({ events: { summary: '', upcoming: [] } });
    const curr = makeOutput({
      events: { summary: '', upcoming: [{ title: 'CPI Release', time: '2026-01-02T13:30:00Z', importance: 'critical' }] },
    });
    const result = computeWhatChanged(prev, curr);
    expect(result).toContain('New event: CPI Release (critical)');
  });

  it('detects removed event', () => {
    const prev = makeOutput({
      events: { summary: '', upcoming: [{ title: 'CPI Release', time: '2026-01-02T13:30:00Z', importance: 'critical' }] },
    });
    const curr = makeOutput({ events: { summary: '', upcoming: [] } });
    const result = computeWhatChanged(prev, curr);
    expect(result).toContain('Event resolved/removed: CPI Release');
  });

  it('detects multiple simultaneous changes', () => {
    const prev = makeOutput({ marketRegime: 'constructive_but_extended', briefConfidence: 'medium' });
    const curr = makeOutput({ marketRegime: 'risk_off', briefConfidence: 'low' });
    const result = computeWhatChanged(prev, curr);
    expect(result.length).toBe(2);
  });

  it('caps output at 8 bullets', () => {
    const prev = makeOutput({
      marketRegime: 'constructive_but_extended',
      briefConfidence: 'medium',
      btc: { ...makeOutput().btc, structure: 'bullish' },
      alts: { ...makeOutput().alts, rotationState: 'selective_rotation' },
      events: {
        summary: '',
        upcoming: [
          { title: 'CPI', time: 'T1', importance: 'critical' },
          { title: 'NFP', time: 'T2', importance: 'high' },
          { title: 'FOMC', time: 'T3', importance: 'critical' },
          { title: 'PPI', time: 'T4', importance: 'medium' },
          { title: 'PCE', time: 'T5', importance: 'medium' },
        ],
      },
    });
    const curr = makeOutput({
      marketRegime: 'risk_off',
      briefConfidence: 'low',
      btc: { ...makeOutput().btc, structure: 'bearish' },
      alts: { ...makeOutput().alts, rotationState: 'no_rotation' },
      events: { summary: '', upcoming: [{ title: 'FED Speaker', time: 'T6', importance: 'high' }] },
    });
    const result = computeWhatChanged(prev, curr);
    expect(result.length).toBeLessThanOrEqual(8);
  });

  it('does not include fallback when there are real changes', () => {
    const prev = makeOutput({ marketRegime: 'constructive_but_extended' });
    const curr = makeOutput({ marketRegime: 'risk_off' });
    const result = computeWhatChanged(prev, curr);
    expect(result).not.toContain('No significant structural changes since previous brief.');
  });

  describe('derivatives funding shift', () => {
    it('detects shift from neutral to extreme positive', () => {
      const prev = makeOutput({ derivatives: { ...makeOutput().derivatives, funding: 'neutral across BTC/ETH' } });
      const curr = makeOutput({ derivatives: { ...makeOutput().derivatives, funding: 'extreme positive (overheated) on BTC, neutral on ETH' } });
      const result = computeWhatChanged(prev, curr);
      expect(result.some((b) => b.includes('Funding shift'))).toBe(true);
    });

    it('detects shift from extreme to neutral', () => {
      const prev = makeOutput({ derivatives: { ...makeOutput().derivatives, funding: 'extreme negative on BTC' } });
      const curr = makeOutput({ derivatives: { ...makeOutput().derivatives, funding: 'neutral across BTC/ETH' } });
      const result = computeWhatChanged(prev, curr);
      expect(result.some((b) => b.includes('Funding shift'))).toBe(true);
    });

    it('detects non-extreme funding changes', () => {
      const prev = makeOutput({ derivatives: { ...makeOutput().derivatives, funding: 'positive elevated across BTC/ETH' } });
      const curr = makeOutput({ derivatives: { ...makeOutput().derivatives, funding: 'negative elevated across BTC/ETH' } });
      const result = computeWhatChanged(prev, curr);
      expect(result.some((b) => b.includes('Funding shift'))).toBe(true);
    });

    it('ignores when funding is unchanged', () => {
      const base = makeOutput({ derivatives: { ...makeOutput().derivatives, funding: 'extreme positive on BTC' } });
      const result = computeWhatChanged(base, makeOutput({ derivatives: { ...makeOutput().derivatives, funding: 'extreme positive on BTC' } }));
      expect(result.some((b) => b.includes('Funding shift'))).toBe(false);
    });
  });

  it('detects BTC position changes', () => {
    const prev = makeOutput({ btc: { ...makeOutput().btc, position: 'below 75K recovery zone' } });
    const curr = makeOutput({ btc: { ...makeOutput().btc, position: 'inside 75K-77K recovery zone' } });
    const result = computeWhatChanged(prev, curr);
    expect(result).toContain('BTC position: below 75K recovery zone → inside 75K-77K recovery zone');
  });

  it('detects alt breadth changes', () => {
    const prev = makeOutput({ alts: { ...makeOutput().alts, breadth: '30% green' } });
    const curr = makeOutput({ alts: { ...makeOutput().alts, breadth: '55% green' } });
    const result = computeWhatChanged(prev, curr);
    expect(result).toContain('Alt breadth: 30% green → 55% green');
  });

  it('detects OI changes', () => {
    const prev = makeOutput({ derivatives: { ...makeOutput().derivatives, oi: 'stable' } });
    const curr = makeOutput({ derivatives: { ...makeOutput().derivatives, oi: 'rising quickly' } });
    const result = computeWhatChanged(prev, curr);
    expect(result).toContain('OI shift: stable → rising quickly');
  });

  it('detects liquidity map changes', () => {
    const prev = makeOutput({ liquidity: { bullets: ['Recovery zone: 74K-75K.'] } });
    const curr = makeOutput({ liquidity: { recoveryZone: '75K-77K', bullets: ['Recovery zone shifted higher.'] } });
    const result = computeWhatChanged(prev, curr);
    expect(result).toContain('Liquidity map changed.');
  });

  describe('ETH/BTC trend direction', () => {
    it('detects falling to rising transition', () => {
      const prev = makeOutput({ eth: { ...makeOutput().eth, vsbtc: 'ETH/BTC falling (-3.1% over 7d)' } });
      const curr = makeOutput({ eth: { ...makeOutput().eth, vsbtc: 'ETH/BTC rising (+2.5% over 7d)' } });
      const result = computeWhatChanged(prev, curr);
      expect(result.some((b) => b.includes('ETH/BTC trend') && b.includes('falling') && b.includes('rising'))).toBe(true);
    });

    it('detects rising to sideways transition', () => {
      const prev = makeOutput({ eth: { ...makeOutput().eth, vsbtc: 'ETH/BTC rising (+4.2% over 7d)' } });
      const curr = makeOutput({ eth: { ...makeOutput().eth, vsbtc: 'ETH/BTC sideways (+0.5% over 7d)' } });
      const result = computeWhatChanged(prev, curr);
      expect(result.some((b) => b.includes('ETH/BTC trend'))).toBe(true);
    });

    it('ignores when direction is unchanged', () => {
      const prev = makeOutput({ eth: { ...makeOutput().eth, vsbtc: 'ETH/BTC rising (+2.0% over 7d)' } });
      const curr = makeOutput({ eth: { ...makeOutput().eth, vsbtc: 'ETH/BTC rising (+3.5% over 7d)' } });
      const result = computeWhatChanged(prev, curr);
      expect(result.some((b) => b.includes('ETH/BTC trend'))).toBe(false);
    });

    it('ignores when vsbtc has no parseable direction', () => {
      const prev = makeOutput({ eth: { ...makeOutput().eth, vsbtc: 'in_line' } });
      const curr = makeOutput({ eth: { ...makeOutput().eth, vsbtc: 'outperforming' } });
      const result = computeWhatChanged(prev, curr);
      expect(result.some((b) => b.includes('ETH/BTC trend'))).toBe(false);
    });
  });
});
