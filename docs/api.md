# API

## Metrics

```http
GET /metrics
```

## Pre-session Crypto Market Brief / Session Overview

```http
GET  /overviews
GET  /overviews/latest/:session
GET  /overviews/:id
POST /overviews/trigger
```

When `SESSION_OVERVIEW_API_TOKEN` is set, manual trigger requests require:

```http
Authorization: Bearer <SESSION_OVERVIEW_API_TOKEN>
```

## Events

```http
GET /events
```

## Collector Runs

```http
GET /collector-runs
```

## Telegram Posts

```http
GET /telegram-posts
```

## Crypto Daily Watchlist — Target API

These endpoints are planned for the Watchlist MVP:

```http
GET  /watchlists
GET  /watchlists/latest/:session
GET  /watchlists/:id
POST /watchlists/trigger
GET  /watchlists/:id/report
GET  /watchlists/:id/scores
GET  /watchlists/:id/qc
```

The Watchlist API should be added as a separate product surface, not as fields under `/overviews`.
