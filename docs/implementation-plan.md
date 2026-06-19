# Implementation Plan

## PR 1 — Project Identity and Docs

- Update README to describe two product surfaces.
- Change root package name from `pre-session-crypto-brief` to `crypto-session-overview`.
- Add initial docs for Market Brief, Watchlist, architecture and API.
- Do not change runtime behavior.

## PR 2 — Market Brief Docs Cleanup

- Expand product documentation for Pre-session Crypto Market Brief.
- Document existing `/overviews`, `/events`, `/collector-runs` and `/telegram-posts` routes.
- Keep `SessionOverview`, `/overviews` and `SESSION_OVERVIEW_*` unchanged.

## PR 3 — Watchlist Core Contract

- Add `core/src/watchlist` schemas and types.
- Define A-List, B-List, Candidate Pool and Removed/Downgraded output.
- Define scoring and data-quality contracts.

## PR 4 — Watchlist Persistence

- Add `CryptoDailyWatchlist` and `WatchlistInput` Prisma models.
- Add repository methods for save/list/latest/get-by-id.

## PR 5 — Watchlist API Skeleton

- Add `/watchlists` routes.
- Add manual trigger route.
- Wire Watchlist service into the API layer.

## PR 6 — Watchlist Runner Skeleton

- Add runner, service and input builder.
- Add MarketBriefContextReader for contextual input from the latest successful overview.

## PR 7 — Candidate Universe

- Build per-asset candidate rows from existing collectors and new watchlist market-data normalization.

## PR 8 — Scoring and Classification

- Add liquidity, volatility, relative strength, sector strength, catalyst, technical structure and risk/data quality scoring.
- Add A/B/Candidate/Excluded classification.
- Add removed/downgraded reason codes.

## PR 9 — QC and No-Signal Guardrails

- Add Watchlist QC.
- Enforce A/B size limits, evidence minimums, data freshness and no-signal language.

## PR 10 — Scheduler and E2E Tests

- Add independent Watchlist scheduler job.
- Add API, scoring, QC and runner tests.
