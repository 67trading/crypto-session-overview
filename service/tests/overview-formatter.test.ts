import { describe, it, expect } from 'vitest';
import { OverviewFormatter } from '../src/overview-formatter.js';
import { PRODUCT_FOOTER_NOTE } from '../src/presentation-contract.js';
import type { OverviewOutput } from '../src/ports.js';

function makeOutput(overrides: Partial<OverviewOutput> = {}): OverviewOutput {
  const base: OverviewOutput = {
    briefId: 'brief-ASIA_CRYPTO-1716000000000',
    generatedAtUtc: '2026-05-18T22:30:00.000Z',
    session: 'ASIA_CRYPTO',
    marketRegime: 'constructive_but_extended',
    briefConfidence: 'medium',
    dataStatus: {
      price: 'fresh',
      events: 'partial',
      derivatives: 'fresh',
      liquidations: 'unavailable',
    },
    whatChanged: [
      'BTC moved from 94k to 96k — approaching weekly high.',
      'Funding shifted from neutral to positive elevated.',
    ],
    btc: {
      summary: 'BTC holding above daily midpoint with steady bid pressure.',
      keyLevels: ['97400', '95800'],
      position: 'above daily midpoint, below weekly high',
      structure: 'bullish',
    },
    eth: {
      summary: 'ETH consolidating near prior highs.',
      vsbtc: 'slight underperformance on 24h',
      keyLevels: ['3450'],
    },
    majorAssets: [
      { symbol: 'SOLUSDT', summary: 'Consolidating below ATH region.', keyLevels: ['185'] },
    ],
    alts: {
      summary: 'Selective rotation into large-cap alts.',
      rotationState: 'selective_rotation',
      breadth: '60% of top 50 green on 24h',
    },
    derivatives: {
      summary: '',
      funding: 'positive elevated across BTC/ETH',
      oi: 'rising slowly',
      positioning: 'long-heavy',
    },
    liquidity: {
      bullets: ['Immediate upside resistance: 97,400.', 'Downside vulnerability below 95,800.'],
    },
    events: {
      summary: 'Light macro calendar this session.',
      upcoming: [],
    },
    scenarios: {
      reclaim: 'BTC clears 97,400 weekly high — extension toward 100k.',
      rejection: 'Failure at 97,400 — retest 95,800 daily open.',
      chop: 'Range 95,800–97,400, no clean resolution.',
    },
    note: PRODUCT_FOOTER_NOTE,
  };
  return { ...base, ...overrides };
}

const formatter = new OverviewFormatter();

describe('OverviewFormatter.format()', () => {
  it('produces a non-empty string', () => {
    const result = formatter.format(makeOutput());
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('does not contain trading instruction phrases', () => {
    const result = formatter.format(makeOutput()).toLowerCase();
    expect(result).not.toMatch(/\bbuy here\b/);
    expect(result).not.toMatch(/\bsell here\b/);
    expect(result).not.toMatch(/\bgo long\b/);
    expect(result).not.toMatch(/\bgo short\b/);
    expect(result).not.toMatch(/\benter at\b/);
    expect(result).not.toMatch(/\bexit at\b/);
  });

  it('allows descriptive positioning terms: long-heavy, short-heavy', () => {
    const result = formatter.format(makeOutput()).toLowerCase();
    expect(result).toContain('long-heavy');
  });

  it('header is desk-note format for ASIA_CRYPTO', () => {
    const result = formatter.format(makeOutput({ session: 'ASIA_CRYPTO' }));
    expect(result).toContain('Crypto Asia Brief');
    expect(result).toContain('Generated:');
  });

  it('header is desk-note format for EUROPE_CRYPTO', () => {
    const result = formatter.format(makeOutput({ session: 'EUROPE_CRYPTO' }));
    expect(result).toContain('Crypto Europe Brief');
    expect(result).toContain('Generated:');
  });

  it('header is desk-note format for US_CRYPTO', () => {
    const result = formatter.format(makeOutput({ session: 'US_CRYPTO' }));
    expect(result).toContain('Crypto US Brief');
    expect(result).toContain('Generated:');
  });

  it('header includes UTC time and Frankfurt time', () => {
    const result = formatter.format(makeOutput({ generatedAtUtc: '2026-05-18T22:30:00.000Z' }));
    expect(result).toContain('UTC');
    expect(result).toContain('Frankfurt');
  });

  it('includes market regime and confidence on separate lines', () => {
    const result = formatter.format(makeOutput());
    expect(result).toContain('Market regime: constructive but extended');
    expect(result).toContain('Brief confidence: medium');
  });

  it('includes all three scenarios', () => {
    const result = formatter.format(makeOutput());
    expect(result).toContain('▶ Reclaim:');
    expect(result).toContain('▶ Rejection:');
    expect(result).toContain('▶ Chop:');
  });

  it('does not include data status line in Telegram output', () => {
    const result = formatter.format(makeOutput());
    expect(result).not.toContain('Price: fresh');
    expect(result).not.toContain('OI/Funding:');
    expect(result).not.toContain('Liq: unavailable');
  });

  it('includes what changed bullets', () => {
    const result = formatter.format(makeOutput());
    expect(result).toContain('• BTC moved from 94k to 96k');
    expect(result).toContain('• Funding shifted');
  });

  it('includes BTC key levels', () => {
    const result = formatter.format(makeOutput());
    expect(result).toContain('97400');
    expect(result).toContain('95800');
  });

  it('includes liquidity section with bullets', () => {
    const result = formatter.format(makeOutput());
    expect(result).toContain('Liquidity:');
    expect(result).toContain('* Immediate upside resistance: 97,400.');
    expect(result).toContain('* Downside vulnerability below 95,800.');
  });

  it('renders multiple liquidity bullets', () => {
    const output = makeOutput({
      liquidity: { bullets: ['Bullet one.', 'Bullet two.', 'Bullet three.'] },
    });
    const result = formatter.format(output);
    expect(result).toContain('* Bullet one.');
    expect(result).toContain('* Bullet two.');
    expect(result).toContain('* Bullet three.');
  });

  it('renders structured liquidity fields before fallback bullets', () => {
    const output = makeOutput({
      liquidity: {
        immediateUpside: '75K supply',
        recoveryZone: '75K-77K',
        largerUpsideMagnet: '80K options area',
        downsideVulnerability: 'low 73K area',
        bullets: ['No confirmed liquidation cluster data available.'],
      },
    });
    const result = formatter.format(output);
    expect(result).toContain('* Immediate upside resistance / liquidity: 75K supply');
    expect(result).toContain('* Recovery confirmation zone: 75K-77K');
    expect(result).toContain('* Larger upside magnet / options area: 80K options area');
    expect(result).toContain('* Downside vulnerability: low 73K area');
    expect(result).toContain('* No confirmed liquidation cluster data available.');
  });

  it('liquidity section appears after derivatives and before events', () => {
    const output = makeOutput({
      events: {
        summary: 'FOMC today.',
        upcoming: [{ title: 'FOMC', time: '21:00 UTC', importance: 'critical' }],
      },
    });
    const result = formatter.format(output);
    const derivPos = result.indexOf('📊 Derivatives');
    const liqPos = result.indexOf('Liquidity:');
    const eventsPos = result.indexOf('📅 Events');
    expect(derivPos).toBeLessThan(liqPos);
    expect(liqPos).toBeLessThan(eventsPos);
  });

  it('omits major assets section even when output contains major assets', () => {
    const result = formatter.format(makeOutput());
    expect(result).not.toContain('📈 Major Assets');
    expect(result).not.toContain('SOLUSDT');
  });

  it('omits major assets section when empty', () => {
    const result = formatter.format(makeOutput({ majorAssets: [] }));
    expect(result).not.toContain('📈 Major Assets');
  });

  it('includes events section when upcoming is non-empty', () => {
    const output = makeOutput({
      events: {
        summary: 'FOMC today.',
        upcoming: [{ title: 'FOMC Minutes', time: '21:00 UTC', importance: 'critical' }],
      },
    });
    const result = formatter.format(output);
    expect(result).toContain('📅 Events');
    expect(result).toContain('FOMC Minutes');
    expect(result).toContain('🔴');
  });

  it('includes events section when summary is non-empty even with empty upcoming', () => {
    const output = makeOutput({
      events: { summary: 'Light macro calendar this session.', upcoming: [] },
    });
    const result = formatter.format(output);
    expect(result).toContain('📅 Events');
  });

  it('omits events section when both summary and upcoming are empty', () => {
    const output = makeOutput({ events: { summary: '', upcoming: [] } });
    const result = formatter.format(output);
    expect(result).not.toContain('📅 Events');
  });

  it('includes footer separator and note', () => {
    const result = formatter.format(makeOutput());
    expect(result).toContain('─────────────────────');
    expect(result).toContain(PRODUCT_FOOTER_NOTE);
  });

  it('omits derivatives summary line when summary is blank', () => {
    const output = makeOutput({
      derivatives: { summary: '', funding: 'neutral', oi: 'stable', positioning: 'balanced' },
    });
    const result = formatter.format(output);
    // Summary should not appear as a standalone line
    expect(result).not.toMatch(/\n\n\n/);
  });

  it('keeps verbose generated reports within one Telegram message', () => {
    const longText = 'This section contains a deliberately verbose market read with repeated context and qualifiers. '.repeat(12);
    const result = formatter.format(makeOutput({
      whatChanged: Array.from({ length: 8 }, (_, i) => `${i + 1}. ${longText}`),
      btc: {
        summary: longText,
        keyLevels: Array.from({ length: 12 }, (_, i) => `${95000 + i * 250} important level with context`),
        position: longText,
        structure: 'bullish',
      },
      eth: {
        summary: longText,
        vsbtc: longText,
        keyLevels: Array.from({ length: 12 }, (_, i) => `${3200 + i * 20} ETH level`),
      },
      alts: {
        summary: longText,
        rotationState: 'broad_rotation',
        breadth: longText,
      },
      derivatives: {
        summary: longText,
        funding: longText,
        oi: longText,
        positioning: longText,
      },
      liquidity: {
        immediateUpside: longText,
        recoveryZone: longText,
        largerUpsideMagnet: longText,
        downsideVulnerability: longText,
        bullets: Array.from({ length: 8 }, () => longText),
      },
      events: {
        summary: longText,
        upcoming: Array.from({ length: 8 }, (_, i) => ({
          title: `${i + 1}. ${longText}`,
          time: longText,
          importance: 'high' as const,
        })),
      },
      scenarios: {
        reclaim: longText,
        rejection: longText,
        chop: longText,
      },
    }));

    expect(result.length).toBeLessThanOrEqual(4096);
    expect(formatter.splitForTelegram(result)).toHaveLength(1);
  });

  it('does not present tracked-basket broad_rotation as market-wide broad rotation', () => {
    const result = formatter.format(makeOutput({
      alts: {
        summary: 'Tracked basket positive.',
        rotationState: 'broad_rotation',
        breadth: '83% of 6 tracked alts positive on 24h',
        sourceScope: 'tracked_basket',
      },
    }));

    expect(result).toContain('Rotation: unavailable');
    expect(result).not.toContain('Rotation: broad rotation');
  });
});

describe('OverviewFormatter.formatCompact()', () => {
  it('renders a shorter Telegram-oriented report', () => {
    const output = makeOutput({
      liquidity: {
        immediateUpside: '97.4k supply',
        recoveryZone: '95.8k-96.2k',
        largerUpsideMagnet: '100k options area',
        downsideVulnerability: 'below 95.8k',
        bullets: ['No confirmed liquidation cluster data available.'],
      },
      events: {
        summary: 'FOMC and CPI are the main event risks.',
        upcoming: [
          { title: 'FOMC Minutes', time: '21:00 UTC', importance: 'critical' },
          { title: 'Low-impact auction', time: '13:00 UTC', importance: 'low' },
        ],
      },
    });

    const full = formatter.format(output);
    const compact = formatter.formatCompact(output);

    expect(compact.length).toBeLessThan(full.length);
    expect(compact.length).toBeLessThanOrEqual(2800);
    expect(formatter.splitForTelegram(compact)).toHaveLength(1);
    expect(compact).toContain('Regime: constructive but extended · Confidence: medium');
    expect(compact).toContain('₿ BTC: bullish');
    expect(compact).toContain('📊 Derivs:');
    expect(compact).toContain('* Upside: 97.4k supply');
    expect(compact).toContain('🔴 FOMC Minutes · 21:00 UTC');
    expect(compact).not.toContain('Low-impact auction');
    expect(compact).toContain('Context only. No entries/exits/sizing/leverage.');
  });

  it('uses a compact low-impact event placeholder', () => {
    const compact = formatter.formatCompact(makeOutput({
      events: {
        summary: 'Light macro calendar this session.',
        upcoming: [{ title: 'Low-impact auction', time: '13:00 UTC', importance: 'low' }],
      },
    }));

    expect(compact).toContain('📅 Events: none high-impact');
    expect(compact).not.toContain('Low-impact auction');
  });

  it('deduplicates compact liquidity bullets against structured values', () => {
    const compact = formatter.formatCompact(makeOutput({
      liquidity: {
        immediateUpside: '97,400 weekly high',
        recoveryZone: '95,800-96,200',
        bullets: ['97,400 weekly high', 'Fresh lower timeframe cluster.'],
      },
    }));

    expect(compact).toContain('* Upside: 97,400 weekly high');
    expect(compact).not.toContain('* 97,400 weekly high');
    expect(compact).toContain('Fresh lower timeframe cluster.');
  });

  it('uses tracked-basket rotation wording in compact reports', () => {
    const compact = formatter.formatCompact(makeOutput({
      alts: {
        summary: 'Tracked basket positive.',
        rotationState: 'broad_rotation',
        breadth: '83% of 6 tracked alts positive on 24h',
        sourceScope: 'tracked_basket',
      },
    }));

    expect(compact).toContain('🌊 Alts: unavailable · 83% of 6 tracked alts positive on 24h');
    expect(compact).not.toContain('broad rotation');
  });
});

describe('OverviewFormatter.formatTelegramHtmlCompact()', () => {
  it('renders premium Telegram HTML with escaped dynamic content and code levels', () => {
    const html = formatter.formatTelegramHtmlCompact(makeOutput({
      marketRegime: 'short_heavy_near_support',
      briefConfidence: 'high',
      dataStatus: {
        price: 'fresh',
        events: 'partial',
        derivatives: 'fresh',
        liquidations: 'unavailable',
      },
      btc: {
        summary: 'BTC lost the previous range and is testing recovery.',
        keyLevels: ['71407.5-71413.9 <recovery>', '74495.8 & resistance'],
        position: 'below daily + weekly midpoints',
        structure: 'bearish',
      },
      events: {
        summary: 'Exchange announcements only.',
        upcoming: [
          { title: 'HYPE Token Splash <promo> & rewards', time: '2026-06-02T11:10:08Z', importance: 'low' },
          { title: 'FOMC <Minutes> & press event', time: '21:00 UTC', importance: 'high' },
        ],
      },
    }));

    expect(html.length).toBeLessThanOrEqual(2800);
    expect(formatter.splitForTelegram(html)).toHaveLength(1);
    expect(html).toContain('<b>Crypto Asia Brief</b>');
    expect(html).toContain('<b>Regime:</b> ⚫ Defensive breakdown near support');
    expect(html).not.toContain('<b>Sources:</b>');
    expect(html).not.toContain('Liq clusters');
    expect(html).toContain('Recovery/ref: <code>71407.5-71413.9 &lt;recovery&gt;</code>');
    expect(html).toContain('Resistance/ref: <code>74495.8 &amp; resistance</code>');
    expect(html).toContain('🔴 FOMC &lt;Minutes&gt; &amp; press event');
    expect(html).not.toContain('HYPE Token Splash');
    expect(html).toContain('Context only. No entries/exits/sizing/leverage.');
    expect(html).not.toContain('...');
  });

  it('uses compact informational event placeholder when only low-impact events exist', () => {
    const html = formatter.formatTelegramHtmlCompact(makeOutput({
      events: {
        summary: 'Exchange promo calendar.',
        upcoming: [{ title: 'Low-impact <promo>', time: '13:00 UTC', importance: 'low' }],
      },
    }));

    expect(html).toContain('🔵 No high-impact BTC/ETH event confirmed');
    expect(html).not.toContain('Low-impact');
  });

  it('deduplicates HTML liquidity bullets against structured values', () => {
    const html = formatter.formatTelegramHtmlCompact(makeOutput({
      liquidity: {
        recoveryZone: '95,800-96,200',
        immediateUpside: '97,400 weekly high',
        bullets: ['95,800-96,200', 'Fresh lower timeframe cluster.'],
      },
    }));

    expect((html.match(/95,800-96,200/g) ?? [])).toHaveLength(1);
    expect(html).toContain('Fresh lower timeframe cluster.');
  });

  it('renders scoped GAP-safe Telegram labels', () => {
    const html = formatter.formatTelegramHtmlCompact(makeOutput({
      briefConfidence: 'medium',
      confidenceBreakdown: {
        signalClarity: 0.9,
        dataCoverage: 0.7,
        venueAgreement: 0.45,
        ambiguityPenalty: 0.3,
        finalScore: 0.65,
        label: 'medium',
        reasons: ['Derivatives are source-scoped, so high confidence is capped.'],
      },
      eth: {
        summary: 'ETH is weak in USD terms.',
        vsbtc: 'ETH/BTC rising — ETH gaining vs BTC (+3.1% over 7d)',
        keyLevels: ['2142'],
        headerLabel: 'ETH/BTC 7d resilience, USD weak',
        ethUsd24hLabel: 'weak',
      },
      alts: {
        summary: 'Tracked basket positive.',
        rotationState: 'broad_rotation',
        breadth: '83% of 6 tracked alts positive on 24h',
        sourceScope: 'tracked_basket',
      },
      derivatives: {
        summary: 'Neutral.',
        funding: 'neutral across BTC/ETH',
        oi: 'stable across BTC/ETH',
        positioning: 'balanced across BTC/ETH',
        sourceScope: 'single_venue',
      },
      liquidity: {
        recoveryZone: '66754.8',
        immediateUpside: '74225.4',
        largerUpsideMagnet: '75000 max pain · Deribit · front_expiry 07JUN26',
        downsideVulnerability: 'below 65412',
        bullets: ['No confirmed liquidation cluster data available.'],
      },
      events: {
        summary: 'Delisting announced.',
        upcoming: [{
          title: 'Delisting of ELON and VINU',
          time: '2026-06-10T08:00:00.000Z',
          importance: 'high',
          displayTimeType: 'tradingEndsAt',
          detail: 'Trading ends: 2026-06-10T08:00:00.000Z',
        }],
      },
      scenarios: {
        reclaim: 'Above 68,806.95 -> relief attempt.',
        rejection: 'Below 66,754.8 -> pressure remains.',
        chop: '65,412-66,754.8 -> range/chop conditions.',
      },
    }));

    expect(html).toContain('<b>Confidence:</b> 🟡 medium');
    expect(html).toContain('<b>Reason:</b> Derivatives are source-scoped');
    expect(html).toContain('Ξ ETH · 🔴 ETH/BTC 7d resilience, USD weak');
    expect(html).toContain('ETH/USD 24h: weak');
    expect(html).toContain('🌊 Alts · ⚪ unavailable');
    expect(html).toContain('Scope: broad alt perp tape unavailable; configured symbols are not used for production Alts breadth');
    expect(html).not.toContain('tracked basket rotation');
    expect(html).not.toContain('Rotation: broad rotation');
    expect(html).toContain('📊 Derivs · ⚪ Bybit-scoped neutral');
    expect(html).toContain('Funding: neutral across BTC/ETH · Bybit-scoped');
    expect(html).toContain('Options ref: <code>75000 max pain · Deribit · front expiry 07JUN26</code>');
    expect(html).toContain('trading ends <code>2026-06-10 08:00 UTC</code>');
    expect(html).toContain('Reclaim: Above 68,806.95 -&gt; relief attempt.');
  });

  it('uses deterministic BTC header label in Telegram instead of raw structure', () => {
    const html = formatter.formatTelegramHtmlCompact(makeOutput({
      whatChanged: [
        'Confidence: high → medium',
        'BTC position: Currently positioned below both daily and weekly midpoints, and trading inside the previous Europe session range. → Below daily midpoint and below weekly midpoint.',
      ],
      btc: {
        summary: 'BTC remains inside the 4H range, but below daily and weekly midpoints, leaving pressure to the downside.',
        keyLevels: ['78089.9 (previous week high)', '74225.4 (4H last swing high)'],
        position: 'Below daily midpoint and below weekly midpoint.',
        structure: 'bearish',
        headerLabel: 'bearish range pressure',
        spotPrice: 66700.12,
      },
      eth: {
        summary: 'ETH context limited.',
        vsbtc: 'ETH/BTC rising — ETH gaining vs BTC (+3.0% over 7d)',
        keyLevels: ['2142'],
        headerLabel: 'ETH/BTC 7d resilience',
        ethUsd24hLabel: 'neutral',
        spotPrice: 1877.45,
      },
    }));

    expect(html).toContain('₿ BTC · 🔴 bearish range pressure');
    expect(html).toContain('Confidence: high → medium');
    expect(html).toContain('BTC position changed.');
    expect(html).not.toContain('trading inside.');
    expect(html).toContain('Spot: <code>66,700.12</code>');
    expect(html).toContain('Spot: <code>1,877.45</code>');
    expect(html).toContain('BTC remains inside the 4H range, but below daily and weekly midpoints, leaving pressure.');
    expect(html).not.toContain('leaving pressure to the downside');
    expect(html).not.toContain('₿ BTC · 🟡 range');
  });

  it('shows ETH/USD 24h as not shown when metadata is unavailable', () => {
    const html = formatter.formatTelegramHtmlCompact(makeOutput({
      eth: {
        summary: 'ETH context limited.',
        vsbtc: 'ETH/BTC rising — ETH gaining vs BTC (+3.0% over 7d)',
        keyLevels: ['2142'],
        headerLabel: 'ETH/BTC 7d resilience',
        ethUsd24hLabel: 'unknown',
      },
    }));

    expect(html).toContain('ETH/BTC rising — ETH gaining vs BTC');
    expect(html).toContain('ETH/USD 24h: not shown');
  });

  it('renders production broad alt perp tape scope', () => {
    const html = formatter.formatTelegramHtmlCompact(makeOutput({
      alts: {
        summary: 'Broad alt perps are positive.',
        rotationState: 'broad_rotation',
        breadth: '61% of 74 liquid alt perps positive on 24h',
        sourceScope: 'broad_alt_perp_tape',
        universeName: 'Bybit/Binance/OKX liquid USDT perp tape',
        canRenderBroadLabel: true,
      },
    }));

    expect(html).toContain('🌊 Alts · ⚪ broad perp rotation');
    expect(html).toContain('Breadth: 61% of 74 liquid alt perps positive on 24h');
    expect(html).toContain('Scope: Bybit/Binance/OKX liquid USDT perp tape');
    expect(html).not.toContain('tracked basket');
  });

  it('renders mixed broad perp tape as breadth-scoped, not broad rotation', () => {
    const html = formatter.formatTelegramHtmlCompact(makeOutput({
      alts: {
        summary: 'Broad alt perps are mixed.',
        rotationState: 'selective_rotation',
        breadth: '53% of 74 liquid alt perps positive on 24h',
        sourceScope: 'broad_alt_perp_tape',
        universeName: 'Bybit/Binance/OKX liquid USDT perp tape',
        canRenderBroadLabel: true,
      },
    }));

    expect(html).toContain('🌊 Alts · 🟡 broad perp breadth mixed');
    expect(html).toContain('Breadth: 53% of 74 liquid alt perps positive on 24h');
    expect(html).not.toContain('Rotation: broad rotation');
  });

  it('renders cross-venue derivatives as funding-confirmed when OI trend coverage is incomplete', () => {
    const html = formatter.formatTelegramHtmlCompact(makeOutput({
      briefConfidence: 'medium',
      confidenceBreakdown: {
        signalClarity: 0.9,
        dataCoverage: 0.7,
        venueAgreement: 0.45,
        ambiguityPenalty: 0.3,
        finalScore: 0.65,
        label: 'medium',
        reasons: ['Derivatives are source-scoped, so high confidence is capped.'],
      },
      derivatives: {
        summary: 'Neutral.',
        funding: 'neutral on 3/3 venues',
        oi: 'neutral on 1/3 venues; OI present without change window on OKX',
        positioning: 'no venue-confirmed stress signal',
        sourceScope: 'cross_venue',
        verificationStatus: 'source_scoped',
      },
    }));

    expect(html).toContain('<b>Reason:</b> OI trend coverage is incomplete, so high confidence is capped.');
    expect(html).toContain('📊 Derivs · ⚫ funding confirmed, OI incomplete');
    expect(html).toContain('Funding: neutral on 3/3 venues');
    expect(html).toContain('OI trend: neutral on 1/3 venues; OKX has present OI only, no change window');
    expect(html).not.toContain('coverage-scoped');
  });

  it('renders coverage and real ETF flow context when present', () => {
    const html = formatter.formatTelegramHtmlCompact(makeOutput({
      coverage: {
        summary: 'Core price 3/3 · Funding 3/3 · OI 1/3 · Options Deribit · Events 6 feeds',
      },
      flows: {
        bullets: [
          'BTC ETF flows: -$519.0M daily · sosovalue',
          'ETH ETF flows: -$90.0M daily · sosovalue',
          'Flow tone: daily outflows',
        ],
      },
    }));

    expect(html).toContain('<b>Coverage:</b> Core price 3/3 · Funding 3/3 · OI 1/3 · Options Deribit · Events 6 feeds');
    expect(html).toContain('<b>🏦 Flows</b>');
    expect(html).toContain('BTC ETF flows: -$519.0M daily · sosovalue');
    expect(html).toContain('ETH ETF flows: -$90.0M daily · sosovalue');
    expect(html).toContain('Flow tone: daily outflows');
  });

});

describe('OverviewFormatter.splitForTelegram()', () => {
  it('returns array of length 1 for a short report', () => {
    const shortReport = 'Short report text.';
    const result = formatter.splitForTelegram(shortReport);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(shortReport);
  });

  it('returns the original string unchanged for report at exactly maxLength', () => {
    const report = 'a'.repeat(4096);
    const result = formatter.splitForTelegram(report);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(report);
  });

  it('splits a long report into multiple chunks each <= 4096 chars', () => {
    const lines = Array.from({ length: 200 }, (_, i) => `Line ${i}: ${'x'.repeat(30)}`);
    const report = lines.join('\n');
    expect(report.length).toBeGreaterThan(4096);

    const chunks = formatter.splitForTelegram(report);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(4096);
    }
  });

  it('reassembled chunks contain all lines from the original report', () => {
    const lines = Array.from({ length: 200 }, (_, i) => `Line ${i}: ${'x'.repeat(30)}`);
    const report = lines.join('\n');

    const chunks = formatter.splitForTelegram(report);
    const reassembled = chunks.join('\n');

    for (const line of lines) {
      expect(reassembled).toContain(line);
    }
  });

  it('returns multiple parts for a report longer than 4096 chars', () => {
    const longLine = 'x'.repeat(2000);
    const report = `${longLine}\n${longLine}\n${longLine}`;
    expect(report.length).toBeGreaterThan(4096);

    const chunks = formatter.splitForTelegram(report);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('splits a single line longer than 4096 chars into safe chunks', () => {
    const report = 'x'.repeat(5000);
    const chunks = formatter.splitForTelegram(report);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('')).toBe(report);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(4096);
    }
  });

  it('does not split overlong HTML lines in the middle of tags', () => {
    const report = `<b>${'x'.repeat(5000)}</b>`;
    const chunks = formatter.splitForTelegram(report);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('')).toBe('x'.repeat(5000));
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(4096);
      expect(chunk).not.toContain('<b>');
      expect(chunk).not.toContain('</b>');
    }
  });

  it('rejects invalid Telegram maxLength values', () => {
    expect(() => formatter.splitForTelegram('report', 0)).toThrow(/maxLength/);
    expect(() => formatter.splitForTelegram('report', 1.5)).toThrow(/maxLength/);
  });
});
