# Crypto Daily Watchlist

## Purpose

Crypto Daily Watchlist is the asset-selection product in `crypto-session-overview`.

It builds a ranked short-list of cryptoassets to observe during the trading day.

The product answers:

> Which assets are worth watching today if a valid setup appears?

## Product Output

The Watchlist product should produce:

- Daily Watchlist Summary;
- Market Context;
- A-List Assets;
- B-List Assets;
- Sector / Narrative Map;
- Key Catalysts;
- Technical Observation Areas;
- Liquidity and Volatility Notes;
- Assets Removed or Downgraded;
- Trader Checklist;
- Data Quality Notes.

## A-List

A-List contains the main assets to observe during the day.

Target size:

```text
3–5 assets
```

An A-List asset should have a strong combination of:

- liquidity;
- volatility;
- relative strength;
- sector strength;
- catalyst quality;
- technical structure;
- acceptable data quality.

## B-List

B-List contains secondary assets that remain relevant but miss one or more A-List conditions.

Target size:

```text
3–7 assets
```

Each B-List asset should have a clear limitation.

## Scoring Model

The Watchlist scoring model is 0–100:

| Component | Weight |
|---|---:|
| Liquidity | 20 |
| Volatility | 15 |
| Relative Strength | 20 |
| Sector Strength | 15 |
| Catalyst Quality | 10 |
| Technical Structure | 15 |
| Risk / Data Quality | 5 |
| Total | 100 |

Score interpretation:

| Score | Category |
|---:|---|
| 80–100 | A-List |
| 65–79 | B-List |
| 50–64 | Candidate Pool |
| Below 50 | Excluded |

Score is not a trading signal. It measures daily watch relevance.

## Product Boundary

Crypto Daily Watchlist is not a trading signal.

It should use language such as:

- asset to watch;
- observation area;
- potential setup area;
- remains relevant if;
- conditional watch.

It should avoid language such as:

- buy now;
- short now;
- enter here;
- guaranteed move;
- will pump.

## Target Technical Surface

The Watchlist should be implemented as a separate product module in this same repository:

```text
core/src/watchlist
service/src/watchlist
api/src/watchlist.routes.ts
app/src/watchlist-job.ts
```

It should not be added as a new field inside `OverviewOutputSchema`.

Target routes:

```http
GET  /watchlists
GET  /watchlists/latest/:session
GET  /watchlists/:id
POST /watchlists/trigger
GET  /watchlists/:id/report
GET  /watchlists/:id/scores
GET  /watchlists/:id/qc
```
