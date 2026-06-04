CREATE TABLE "VenueSnapshot" (
    "id" TEXT NOT NULL,
    "venue" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "normalizedUsd" DOUBLE PRECISION,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT,
    "venueInstrument" TEXT,
    "rawJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VenueSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VenueSnapshot_venue_asset_metric_observedAt_key"
    ON "VenueSnapshot"("venue", "asset", "metric", "observedAt");

CREATE INDEX "VenueSnapshot_venue_asset_metric_observedAt_idx"
    ON "VenueSnapshot"("venue", "asset", "metric", "observedAt");
