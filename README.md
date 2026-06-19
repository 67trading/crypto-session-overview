# crypto-session-overview

Daily crypto preparation system for 67 Trading.

This repository contains two product surfaces:

1. **Pre-session Crypto Market Brief**
2. **Crypto Daily Watchlist**

The first product is already implemented as the existing session overview / market brief pipeline. The second product is the next product surface to be added in this same project as an independent watchlist module with its own contract, runner, persistence, API and quality-control rules.

## Products

### Pre-session Crypto Market Brief

Pre-session Crypto Market Brief is the market-context product.

It collects market data, derivatives context, events and source-health information, then produces a structured brief via LLM for Asia, Europe and US crypto sessions.

It helps answer:

> What kind of market day is this?

The Market Brief product covers:

- market regime;
- BTC and ETH context;
- major asset context;
- altcoin breadth;
- derivatives and liquidity context;
- flows and event context;
- scenario framing;
- source-health and data-quality notes.

The current implementation exposes this product through the existing `SessionOverview` domain, `/overviews` API routes and scheduler jobs.

### Crypto Daily Watchlist

Crypto Daily Watchlist is the asset-selection product.

It builds a ranked short-list of cryptoassets to observe during the trading day based on:

- liquidity;
- volatility;
- relative strength versus BTC and ETH;
- sector / narrative strength;
- catalysts;
- technical structure;
- risk and data quality.

It helps answer:

> Which assets are worth watching today if a valid setup appears?

Crypto Daily Watchlist is not a trading signal. It does not say “buy”, “sell”, “long”, “short” or “enter now”. It creates a prepared watchlist for trader focus and pre-session planning.

The intended Watchlist product surface includes:

- A-List assets;
- B-List assets;
- candidate pool;
- removed / downgraded assets;
- sector / narrative map;
- key catalysts;
- technical observation areas;
- liquidity and volatility notes;
- trader checklist;
- data-quality and freshness notes;
- no-signal language guardrails.

## Product Boundary

`crypto-session-overview` is a trading preparation project, not an execution system.

It does not:

- execute trades;
- generate automatic entries;
- manage positions;
- replace risk management;
- guarantee price movement.

The intended product separation is:

```text
Pre-session Crypto Market Brief = market/session context
Crypto Daily Watchlist          = asset selection for observation
Trade Setup Layer               = future trade scenario layer
Execution Layer                 = future trade management / execution layer
```

Crypto Market Brief and Crypto Daily Watchlist may share collectors, normalized data snapshots, source-health checks and infrastructure, but each product should have its own:

- output contract;
- pipeline;
- persistence model;
- API endpoints;
- quality-control rules.

## Current Implementation Status

Currently implemented:

- Pre-session Crypto Market Brief / Session Overview pipeline;
- market data and event collectors;
- source-health handling;
- LLM-based structured overview generation;
- API routes for overviews, events, collector runs and Telegram posts;
- Prisma persistence;
- scheduler and manual trigger support;
- Telegram publishing support for overviews.

Planned next product implementation:

- Crypto Daily Watchlist;
- watchlist output contract;
- per-asset universe builder;
- 0–100 scoring model;
- A-List / B-List classification;
- removed / downgraded assets;
- watchlist quality-control layer;
- `/watchlists` API endpoints;
- independent watchlist scheduler job.

## Install / Test / Run

```sh
# 1. Install all workspace dependencies
# This also runs prisma generate via postinstall.
npm install

# 2. Start PostgreSQL
docker compose up -d postgres

# 3. Configure environment
cp .env.example .env
# Edit .env — set GEMINI_API_KEY and DATABASE_URL at minimum.

# 4. Apply local Prisma migrations to PostgreSQL
npm run prisma:migrate:dev

# 5. Type-check all packages
npm run typecheck

# 6. Run all tests
npm test

# 7. Start the app
npm start
```

## Packages

| Package | Description |
|---|---|
| `core` | Domain types, product contracts, session windows, HTF levels and event helpers |
| `service` | Product runners, collectors, LLM client, source-health handling and product logic |
| `api` | Express router exposing product APIs |
| `app` | Entry point: scheduler, API server and Prisma-backed repositories |

## Environment Variables

See `.env.example` for all variables.

Required:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `GEMINI_API_KEY` | Google AI Studio / Gemini API key for the LLM client |

Currently supported Market Brief / Session Overview variables:

| Variable | Description |
|---|---|
| `SESSION_OVERVIEW_API_TOKEN` | Optional bearer token protecting `POST /overviews/trigger`; set this in staging/production |
| `SESSION_OVERVIEW_TRIGGER_RATE_LIMIT_MAX` | Optional trigger limit per token/window; defaults to `5` |
| `SESSION_OVERVIEW_TRIGGER_RATE_LIMIT_WINDOW_MS` | Optional trigger window; defaults to `600000` |

Example local database URL:

```sh
DATABASE_URL=postgresql://crypto:crypto@localhost:5432/crypto_session_overview?schema=public
```

The database name remains `crypto_session_overview` for compatibility with the existing local and Docker setup.

Future Watchlist variables may be added when the Crypto Daily Watchlist product is implemented.

## API

### Metrics

Operational counters are exposed as JSON at:

```http
GET /metrics
```

### Pre-session Crypto Market Brief / Session Overviews

When `SESSION_OVERVIEW_API_TOKEN` is set, manual trigger requests require:

```http
Authorization: Bearer <SESSION_OVERVIEW_API_TOKEN>
```

Existing overview routes expose Market Brief / Session Overview functionality:

```http
GET  /overviews
GET  /overviews/latest/:session
GET  /overviews/:id
POST /overviews/trigger
```

### Events and Collector Runs

Supporting market/event data and collector-run information are available through:

```http
GET /events
GET /collector-runs
```

### Telegram Posts

Generated Telegram overview posts are available through:

```http
GET /telegram-posts
```

### Crypto Daily Watchlist

Crypto Daily Watchlist is planned as a separate product surface in this same project.

Target route group:

```http
GET  /watchlists
GET  /watchlists/latest/:session
GET  /watchlists/:id
POST /watchlists/trigger
GET  /watchlists/:id/report
GET  /watchlists/:id/scores
GET  /watchlists/:id/qc
```

These routes should be added when the Watchlist MVP is implemented.

## Prisma

Schema lives at:

```text
prisma/schema.prisma
```

After adding or changing Prisma models, generate the Prisma client:

```sh
npm run prisma:generate
```

For local development, apply migrations to the Docker PostgreSQL database with:

```sh
npm run prisma:migrate:dev
```

For staging/production deploys, apply committed migrations without using `db push`:

```sh
npm run prisma:migrate:deploy
npm run prisma:generate
```

## Docker

```sh
docker compose up --build
```

The compose stack starts PostgreSQL and the app.

Inside the Docker network, the app currently uses:

```sh
DATABASE_URL=postgresql://crypto:crypto@postgres:5432/crypto_session_overview?schema=public
```

The app applies committed Prisma migrations with:

```sh
prisma migrate deploy
```

before startup.

## Suggested Documentation Structure

```text
docs/
  pre-session-crypto-market-brief.md
  crypto-daily-watchlist.md
  architecture.md
  api.md
  implementation-plan.md
```

## Roadmap

Near-term:

- keep existing Pre-session Crypto Market Brief functionality stable;
- add Crypto Daily Watchlist core schemas;
- add Watchlist persistence and API routes;
- implement per-asset universe builder;
- implement watchlist scoring and classification;
- add watchlist QC and no-signal guardrails;
- schedule Watchlist as an independent product job.

Later:

- dashboard views;
- historical watchlist archive;
- delivery channels;
- score history;
- intraday refresh;
- future Trade Setup Layer integration.
