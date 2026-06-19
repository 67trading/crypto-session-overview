# Architecture

## Project Shape

`crypto-session-overview` is one project with two product surfaces:

```text
Pre-session Crypto Market Brief = market/session context
Crypto Daily Watchlist          = asset selection for observation
```

The products may share collectors, source-health checks, event data, normalized market snapshots and repository patterns, but each product should keep its own domain contract and runtime surface.

## Current Product Surface

The currently implemented product is Pre-session Crypto Market Brief, exposed through the existing `SessionOverview` implementation.

Current major areas:

```text
core/src/overview
service/src/overview-*
api/src/router.ts
app/src/scheduler.ts
prisma/schema.prisma
```

## Target Watchlist Product Surface

The Watchlist should be added beside the existing overview code:

```text
core/src/watchlist
service/src/watchlist
api/src/watchlist.routes.ts
app/src/watchlist-job.ts
```

## Watchlist Pipeline Target

```text
WatchlistRunner
→ WatchlistInputBuilder
→ MarketBriefContextReader
→ AssetUniverseBuilder
→ PerAssetMarketDataBuilder
→ SectorTaxonomyMapper
→ CatalystEnrichment
→ TechnicalStructureAnalyzer
→ WatchlistScoringEngine
→ WatchlistClassifier
→ DowngradeReasonBuilder
→ WatchlistNarrativeGenerator
→ WatchlistQualityControl
→ WatchlistRepository.save()
```

## Boundary Rule

Do not put Watchlist output inside `OverviewOutputSchema`.

Correct:

```text
/overviews   → Market Brief
/watchlists  → Daily Watchlist
```

Wrong:

```text
/overviews → Market Brief with embedded watchlist section
```
