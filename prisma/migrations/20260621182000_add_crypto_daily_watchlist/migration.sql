CREATE TABLE "CryptoDailyWatchlist" (
    "id" TEXT NOT NULL,
    "session" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "outputJson" TEXT NOT NULL,
    "humanReport" TEXT,
    "inputSnapshotId" TEXT,
    "marketRegime" TEXT,
    "scoreSummaryJson" TEXT,
    "dataQualityJson" TEXT,
    "qcResultJson" TEXT,
    "sourceOverviewId" TEXT,
    "runKey" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CryptoDailyWatchlist_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WatchlistInput" (
    "id" TEXT NOT NULL,
    "session" TEXT NOT NULL,
    "inputJson" TEXT NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchlistInput_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CryptoDailyWatchlist_runKey_key"
    ON "CryptoDailyWatchlist"("runKey");

CREATE INDEX "CryptoDailyWatchlist_session_generatedAt_idx"
    ON "CryptoDailyWatchlist"("session", "generatedAt");

CREATE INDEX "CryptoDailyWatchlist_status_idx"
    ON "CryptoDailyWatchlist"("status");

CREATE INDEX "CryptoDailyWatchlist_marketRegime_idx"
    ON "CryptoDailyWatchlist"("marketRegime");

CREATE INDEX "CryptoDailyWatchlist_sourceOverviewId_idx"
    ON "CryptoDailyWatchlist"("sourceOverviewId");

CREATE INDEX "WatchlistInput_session_savedAt_idx"
    ON "WatchlistInput"("session", "savedAt");
