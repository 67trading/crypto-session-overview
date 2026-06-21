# Implementation Plan

## Current Status

PR 1 is complete. The repository is positioned as one project with two product surfaces:

1. Pre-session Crypto Market Brief
2. Crypto Daily Watchlist

The existing Session Overview / Market Brief pipeline is the first implemented product surface.

Crypto Daily Watchlist starts from PR 2 as a separate product module in the same repository.

## PR 2 — Watchlist Core Contract

Adds the core Watchlist schemas and types.

Scope:

- `core/src/watchlist/watchlist-score.schema.ts`
- `core/src/watchlist/watchlist-quality.schema.ts`
- `core/src/watchlist/watchlist-asset.schema.ts`
- `core/src/watchlist/watchlist-input.schema.ts`
- `core/src/watchlist/watchlist-output.schema.ts`
- `core/src/watchlist/index.ts`
- exports from `core/src/index.ts`
- schema tests

No Prisma, API, service runner or scheduler changes.

## PR 3 — Watchlist Persistence

Adds Watchlist persistence models and repository.

Scope:

- `CryptoDailyWatchlist` Prisma model
- `WatchlistInput` Prisma model
- `service/src/watchlist/watchlist.repository.ts`

Methods: `saveInput`, `saveWatchlist`, `listWatchlists`, `getLatestWatchlist`, `getWatchlistById`.

## PR 4 — Watchlist API Skeleton

Adds `/watchlists` API surface.

Routes:

- `GET /watchlists`
- `GET /watchlists/latest/:session`
- `GET /watchlists/:id`
- `POST /watchlists/trigger`
- `GET /watchlists/:id/report`
- `GET /watchlists/:id/scores`
- `GET /watchlists/:id/qc`

Auth env vars: `WATCHLIST_API_TOKEN`, `WATCHLIST_TRIGGER_RATE_LIMIT_MAX`, `WATCHLIST_TRIGGER_RATE_LIMIT_WINDOW_MS`.

## PR 5 — Watchlist Runner Skeleton

Adds orchestration layer.

Scope:

- `service/src/watchlist/watchlist-runner.ts`
- `service/src/watchlist/watchlist.service.ts`
- `service/src/watchlist/watchlist-input-builder.ts`
- `service/src/watchlist/index.ts`

Pipeline shape: `WatchlistRunner` → `WatchlistInputBuilder` → `MarketBriefContextAdapter` → downstream stages → `WatchlistRepository.save()`.

## PR 6 — Market Brief Context Adapter

Adds adapter for using the latest Market Brief as contextual input.

Scope:

- `service/src/watchlist/market-brief-context-adapter.ts`

This does not make Watchlist part of `OverviewOutputSchema`. Missing overview causes degraded run; stale overview adds caution flag.

## PR 7 — Asset Universe and Per-Asset Market Rows

Builds tradable candidate universe and normalized per-asset rows.

Scope:

- `service/src/watchlist/universe/asset-universe-builder.ts`
- `service/src/watchlist/universe/watchlist-candidate.types.ts`
- `service/src/watchlist/market-data/per-asset-market-data-builder.ts`

Candidate rows include price change, 24h/7d volume, market cap, ATR, spread proxy, relative performance vs BTC/ETH/sector.

## PR 8 — Sector Taxonomy and Relative Strength

Adds sector taxonomy, sector strength and relative strength inputs.

Scope:

- `service/src/watchlist/sector/sector-taxonomy.ts`
- `service/src/watchlist/sector/sector-strength-engine.ts`
- `service/src/watchlist/scoring/relative-strength-scorer.ts`

Sectors: Layer 1, Layer 2, DeFi, RWA, AI, DePIN, Gaming, Meme, Liquid Staking, Oracle, Bitcoin Ecosystem, Ethereum Ecosystem, Solana Ecosystem, Other, Unknown.

## PR 9 — Scoring Engine

Adds weighted 0–100 scoring.

Scope:

- `service/src/watchlist/scoring/liquidity-scorer.ts`
- `service/src/watchlist/scoring/volatility-scorer.ts`
- `service/src/watchlist/scoring/relative-strength-scorer.ts`
- `service/src/watchlist/scoring/sector-strength-scorer.ts`
- `service/src/watchlist/scoring/catalyst-scorer.ts`
- `service/src/watchlist/scoring/technical-structure-scorer.ts`
- `service/src/watchlist/scoring/risk-data-quality-scorer.ts`
- `service/src/watchlist/scoring/watchlist-scoring-engine.ts`

Weights: Liquidity 20, Volatility 15, Relative Strength 20, Sector Strength 15, Catalyst Quality 10, Technical Structure 15, Risk/Data Quality 5.

Thresholds: A-List ≥ 80, B-List ≥ 65, Candidate Pool ≥ 50.

Score means watch relevance, not trading signal.

## PR 10 — Catalyst Enrichment

Maps events, unlocks and catalysts to candidate assets.

Scope:

- `service/src/watchlist/catalysts/catalyst-enrichment.ts`
- `service/src/watchlist/catalysts/catalyst-mapper.ts`
- `service/src/watchlist/catalysts/catalyst-quality.ts`

Catalyst types: token_unlock, protocol_upgrade, governance, ecosystem_news, tvl_revenue_activity, security_incident, regulatory, macro, etf_flow, other.

Catalyst is a reason to observe, not an entry trigger.

## PR 11 — Technical Structure Analyzer

Adds observation areas, invalidation context and extended move risk.

Scope:

- `service/src/watchlist/technical/technical-structure-analyzer.ts`
- `service/src/watchlist/technical/technical-structure.types.ts`

Output includes: `structureType`, `trendState`, `observationArea`, `invalidationContext`, `extendedMoveRisk`, `evidence`, `flags`.

Language remains observation-based, not entry-based.

## PR 12 — Classifier and Removed/Downgraded

Classifies assets into final buckets and builds removed/downgraded list.

Scope:

- `service/src/watchlist/classification/watchlist-classifier.ts`
- `service/src/watchlist/classification/downgrade-reason-builder.ts`

Final buckets: A-List (max 5), B-List (max 7), Candidate Pool, Excluded, Removed/Downgraded.

Reason codes: `LOW_LIQUIDITY`, `WEAK_VOLUME_STABILITY`, `POOR_SPREAD_PROXY`, `EXTENDED_MOVE`, `WEAK_VS_BTC`, `WEAK_VS_ETH`, `WEAK_SECTOR`, `NO_CLEAR_STRUCTURE`, `MISSING_TECHNICAL_DATA`, `STALE_MARKET_DATA`, `NEGATIVE_CATALYST`, `NEWS_SHOCK_RISK`, `SOURCE_CONFLICT`, `OVERCONCENTRATION_LIMIT`, `QUALITY_GATE_FAILED`.

## PR 13 — Narrative Generator

Builds the user-facing Crypto Daily Watchlist report.

Scope:

- `service/src/watchlist/narrative/watchlist-narrative-generator.ts`
- `service/src/watchlist/narrative/watchlist-report-template.ts`

Report sections: Daily Watchlist Summary, Market Context, A-List, B-List, Sector/Narrative Map, Key Catalysts, Technical Observation Areas, Liquidity and Volatility Notes, Removed/Downgraded Assets, Trader Checklist, Data Quality Notes.

Tone: clear, practical, evidence-based, non-hype.

## PR 14 — Quality Control and No-Signal Guardrails

Adds product invariants.

Scope:

- `service/src/watchlist/qc/watchlist-quality-control.ts`
- `service/src/watchlist/qc/watchlist-output-invariants.ts`
- `service/src/watchlist/qc/no-signal-language.ts`

QC checks: schema validation, A-List max 5, B-List max 7, every A/B asset has score, every A/B asset has at least 2 evidence categories, every A-List asset has `observationArea`, every B-List asset has `limitation`, `isSignal=false`, score/tier consistency, stale market data blocks A-List, missing liquidity blocks A-List, forbidden signal language blocked, freshness notes exist.

## PR 15 — Scheduler Job

Adds independent scheduled Watchlist generation.

Scope:

- `app/src/watchlist-job.ts`
- updates to `app/src/scheduler.ts` and `app/src/config.ts`

Env vars: `WATCHLIST_ENABLED`, `WATCHLIST_CRON_EUROPE`, `WATCHLIST_SCHEDULER_TIMEZONE`.

Scheduler lock IDs: `scheduler-overview-EUROPE_CRYPTO`, `scheduler-watchlist-EUROPE_CRYPTO`.

Product timing: 08:00 Market Brief → 08:30 Daily Watchlist. Same-day duplicate protected by `runKey`.

## PR 16 — E2E Tests and Final Docs

Adds full integration tests, fixtures and final README/API documentation updates.

Test coverage: core watchlist schema tests, repository tests, API route tests, runner integration tests, scoring tests, classifier tests, QC tests, scheduler tests, overview regression tests.

Fixtures: `risk_on_sector_strength`, `neutral_mixed_market`, `risk_off_high_event_risk`, `stale_market_data`, `extended_momentum_assets`, `missing_market_brief_context`.

README update: `/watchlists` routes move from planned to implemented, Watchlist env vars documented, Watchlist scheduler documented, Watchlist acceptance criteria documented.

## Non-Goals for Watchlist MVP

Not included in the production-shaped MVP:

- intraday refresh
- alerts
- dashboard UI
- Telegram/Discord delivery
- score history
- personalized preferences
- execution integration
- trade setup layer integration
