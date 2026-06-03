import type {
  CrossVenueConsensus,
  DerivativesConsensus,
  MetricDirection,
  NormalizedVenueSnapshot,
  Venue,
  VenueMetricConsensus,
  VerificationStatus,
} from './ports.js';

const REQUIRED_VENUES: Venue[] = ['bybit', 'binance', 'okx'];

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function coverageScore(available: Venue[]): number {
  return round2(available.length / REQUIRED_VENUES.length);
}

function agreementScore(directions: MetricDirection[]): number {
  const usable = directions.filter((direction) => direction !== 'unavailable' && direction !== 'mixed');
  if (usable.length === 0) return 0;
  const counts = new Map<MetricDirection, number>();
  for (const direction of usable) counts.set(direction, (counts.get(direction) ?? 0) + 1);
  return round2(Math.max(...counts.values()) / usable.length);
}

function majorityDirection(directions: MetricDirection[]): MetricDirection {
  const usable = directions.filter((direction) => direction !== 'unavailable' && direction !== 'mixed');
  if (usable.length === 0) return 'unavailable';
  const counts = new Map<MetricDirection, number>();
  for (const direction of usable) counts.set(direction, (counts.get(direction) ?? 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length > 1 && sorted[0]![1] === sorted[1]![1]) return 'mixed';
  return sorted[0]![0];
}

function verificationStatus(coverage: number, agreement: number): VerificationStatus {
  if (coverage >= 0.67 && agreement >= 0.67) return 'confirmed_cross_venue';
  if (coverage > 0 && coverage < 0.67) return 'source_scoped';
  if (coverage >= 0.67 && agreement < 0.67) return 'ambiguous';
  return 'unavailable';
}

function fundingDirection(rate: number | undefined): MetricDirection {
  if (rate === undefined) return 'unavailable';
  if (rate > 0.0005) return 'bullish';
  if (rate < -0.0005) return 'bearish';
  return 'neutral';
}

function oiDirection(changePct: number | undefined): MetricDirection {
  if (changePct === undefined) return 'unavailable';
  if (changePct > 5) return 'bullish';
  if (changePct < -1) return 'bearish';
  return 'neutral';
}

function priceDirection(changePct: number | undefined): MetricDirection {
  if (changePct === undefined) return 'unavailable';
  if (changePct > 1) return 'bullish';
  if (changePct < -1) return 'bearish';
  return 'neutral';
}

function buildMetricConsensus(params: {
  metric: VenueMetricConsensus['metric'];
  asset?: 'BTC' | 'ETH';
  rows: Array<{ venue: Venue; value?: number; direction: MetricDirection; reason?: string }>;
}): VenueMetricConsensus {
  const venuesAvailable = params.rows
    .filter((row) => row.direction !== 'unavailable')
    .map((row) => row.venue);
  const coverage = coverageScore([...new Set(venuesAvailable)]);
  const agreement = agreementScore(params.rows.map((row) => row.direction));
  const direction = majorityDirection(params.rows.map((row) => row.direction));
  const status = verificationStatus(coverage, agreement);
  return {
    metric: params.metric,
    ...(params.asset !== undefined ? { asset: params.asset } : {}),
    venuesRequired: REQUIRED_VENUES,
    venuesAvailable: [...new Set(venuesAvailable)],
    coverageScore: coverage,
    agreementScore: agreement,
    direction,
    perVenue: params.rows.map((row) => ({
      venue: row.venue,
      ...(row.value !== undefined ? { value: row.value } : {}),
      direction: row.direction,
      verificationStatus: row.direction === 'unavailable' ? 'unavailable' : status,
      ...(row.reason !== undefined ? { reason: row.reason } : {}),
    })),
    conflicts: params.rows
      .filter((row) => row.direction !== 'unavailable' && direction !== 'mixed' && row.direction !== direction)
      .map((row) => ({ venue: row.venue, direction: row.direction, reason: row.reason ?? `${params.metric} differs` })),
    verificationStatus: status,
  };
}

function btcRows(snapshots: NormalizedVenueSnapshot[]): NormalizedVenueSnapshot[] {
  return snapshots.filter((snapshot) => snapshot.asset === 'BTC');
}

export function buildCrossVenueConsensus(snapshots: NormalizedVenueSnapshot[]): CrossVenueConsensus {
  const btc = btcRows(snapshots);
  const price = buildMetricConsensus({
    metric: 'price_24h',
    asset: 'BTC',
    rows: REQUIRED_VENUES.map((venue) => {
      const snap = btc.find((item) => item.venue === venue);
      const value = snap?.ticker24h?.change24hPct;
      return {
        venue,
        ...(value !== undefined ? { value } : {}),
        direction: priceDirection(value),
        reason: value !== undefined ? `${round2(value)}% 24h` : 'price unavailable',
      };
    }),
  });

  const funding = buildMetricConsensus({
    metric: 'funding',
    asset: 'BTC',
    rows: REQUIRED_VENUES.map((venue) => {
      const snap = btc.find((item) => item.venue === venue);
      const value = snap?.funding?.normalizedPer8h ?? snap?.funding?.rate;
      return {
        venue,
        ...(value !== undefined ? { value } : {}),
        direction: fundingDirection(value),
        reason: value !== undefined ? `funding ${value}` : 'funding unavailable',
      };
    }),
  });

  const openInterest = buildMetricConsensus({
    metric: 'open_interest',
    asset: 'BTC',
    rows: REQUIRED_VENUES.map((venue) => {
      const snap = btc.find((item) => item.venue === venue);
      const value = snap?.openInterest?.change24hPct;
      const fallbackValue = snap?.openInterest?.normalizedUsd;
      return {
        venue,
        ...(value !== undefined ? { value } : fallbackValue !== undefined ? { value: fallbackValue } : {}),
        direction: oiDirection(value),
        reason: value !== undefined ? `${round2(value)}% OI 24h` : fallbackValue !== undefined ? 'OI present without change window' : 'OI unavailable',
      };
    }),
  });

  const combinedLabel: DerivativesConsensus['combinedLabel'] =
    funding.verificationStatus === 'unavailable' && openInterest.verificationStatus === 'unavailable' ? 'unavailable'
    : funding.verificationStatus === 'ambiguous' || openInterest.verificationStatus === 'ambiguous' ? 'mixed'
    : funding.direction === 'mixed' || openInterest.direction === 'mixed' ? 'mixed'
    : funding.verificationStatus !== 'confirmed_cross_venue' && openInterest.verificationStatus !== 'confirmed_cross_venue' ? 'single_source'
    : funding.direction === 'neutral' && openInterest.direction === 'neutral' ? 'cross_venue_neutral'
    : funding.direction === 'bullish' || openInterest.direction === 'bullish' ? 'cross_venue_bullish'
    : funding.direction === 'bearish' || openInterest.direction === 'bearish' ? 'cross_venue_bearish'
    : 'mixed';

  const derivatives: DerivativesConsensus = {
    funding,
    openInterest,
    combinedLabel,
    confidenceContribution: round2((funding.coverageScore + funding.agreementScore + openInterest.coverageScore + openInterest.agreementScore) / 4),
  };

  return { price, derivatives };
}
