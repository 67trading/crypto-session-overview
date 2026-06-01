FROM node:20-bookworm-slim AS deps

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY core/package.json core/package.json
COPY service/package.json service/package.json
COPY api/package.json api/package.json
COPY app/package.json app/package.json
COPY prisma/schema.prisma prisma/schema.prisma

RUN npm ci

FROM node:20-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run prisma:generate

EXPOSE 3100

CMD ["sh", "-c", "npm run prisma:migrate:deploy && npm start"]
