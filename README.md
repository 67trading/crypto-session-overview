# crypto-session-overview

Pre-session crypto market brief generator. Collects market data, derivatives, and events, then produces a structured brief via LLM for Asia, Europe, and US crypto sessions.

## Install / Test / Run

```sh
# 1. Install all workspace dependencies (also runs prisma generate via postinstall)
npm install

# 2. Start PostgreSQL
docker compose up -d postgres

# 3. Configure environment
cp .env.example .env
# Edit .env — set GEMINI_API_KEY and DATABASE_URL at minimum

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
|---------|-------------|
| `core` | Domain types, session windows, HTF levels, event helpers |
| `service` | Overview runner, collectors, LLM client, source health |
| `api` | Express router exposing overviews, events, collector-runs |
| `app` | Entry point: scheduler, API server, Prisma repository |

## Environment variables

See `.env.example` for all variables. Required:

- `DATABASE_URL` — PostgreSQL connection string, e.g. `postgresql://crypto:crypto@localhost:5432/crypto_session_overview?schema=public`
- `GEMINI_API_KEY` — Google AI Studio / Gemini API key for the LLM client
- `SESSION_OVERVIEW_API_TOKEN` — optional bearer token protecting `POST /overviews/trigger`; set this in staging/production
- `SESSION_OVERVIEW_TRIGGER_RATE_LIMIT_MAX` — optional trigger limit per token/window; defaults to `5`
- `SESSION_OVERVIEW_TRIGGER_RATE_LIMIT_WINDOW_MS` — optional trigger window; defaults to `600000`

## API

When `SESSION_OVERVIEW_API_TOKEN` is set, manual trigger requests require:

```sh
Authorization: Bearer <SESSION_OVERVIEW_API_TOKEN>
```

Operational counters are exposed as JSON at:

```sh
GET /metrics
```

## Prisma

Schema lives at `prisma/schema.prisma`. After adding migrations run:

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

The compose stack starts PostgreSQL and the app. The app uses `DATABASE_URL=postgresql://crypto:crypto@postgres:5432/crypto_session_overview?schema=public` inside the Docker network and applies committed Prisma migrations with `prisma migrate deploy` before startup.
