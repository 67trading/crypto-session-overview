# Pre-session Crypto Market Brief

## Purpose

Pre-session Crypto Market Brief is the market-context product in `crypto-session-overview`.

It helps a trader understand the market environment before a session starts. It does not choose individual trade entries and does not execute trades.

The product answers:

> What kind of market day is this?

## Trader-Facing Output

The Market Brief should provide:

- market regime;
- BTC context;
- ETH context;
- major asset context;
- altcoin breadth;
- derivatives context;
- liquidity context;
- event context;
- scenario framing;
- data-quality and source-health notes.

## Current Technical Surface

The current implementation uses the existing `SessionOverview` domain.

Primary API routes:

```http
GET  /overviews
GET  /overviews/latest/:session
GET  /overviews/:id
POST /overviews/trigger
```

Supporting routes:

```http
GET /events
GET /collector-runs
GET /telegram-posts
```

## Product Boundary

The Market Brief is not a trading signal.

It should avoid language that tells the trader to buy, sell, long, short or enter now. It should describe market context, risk, scenarios and conditions.

## Implementation Notes

Keep the existing technical names for now:

- `SessionOverview`;
- `OverviewInput`;
- `/overviews`;
- `SESSION_OVERVIEW_*` environment variables.

These are implementation names for the current Market Brief product and should not be aggressively renamed during the Watchlist implementation.
