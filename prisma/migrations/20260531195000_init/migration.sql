-- CreateTable
CREATE TABLE "SessionOverview" (
    "id" TEXT NOT NULL,
    "session" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "outputJson" TEXT NOT NULL,
    "humanReport" TEXT,
    "inputSnapshotId" TEXT,
    "telegramPostIds" TEXT NOT NULL DEFAULT '[]',
    "promptVersion" TEXT,
    "model" TEXT,
    "marketRegime" TEXT,
    "briefConfidence" TEXT,
    "dataStatusJson" TEXT,
    "whatChangedJson" TEXT,
    "scenariosJson" TEXT,
    "sourceHealthJson" TEXT,
    "liquidityJson" TEXT,
    "eventsJson" TEXT,
    "scenarioMapJson" TEXT,
    "crossMarketJson" TEXT,
    "etfFlowJson" TEXT,
    "optionsJson" TEXT,
    "sessionWindowStart" TIMESTAMP(3),
    "sessionWindowEnd" TIMESTAMP(3),
    "runKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionOverview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OverviewInput" (
    "id" TEXT NOT NULL,
    "session" TEXT NOT NULL,
    "inputJson" TEXT NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OverviewInput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectedEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "relevanceScore" DOUBLE PRECISION NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "rawJson" TEXT NOT NULL,
    "asset" TEXT,
    "exchange" TEXT,
    "scheduledTime" TEXT,
    "importance" TEXT,
    "confidence" TEXT,
    "duplicateGroupId" TEXT,
    "sessionImpact" TEXT,
    "detectedAt" TIMESTAMP(3),
    "sessionRelevanceText" TEXT NOT NULL DEFAULT '',
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectorRun" (
    "id" TEXT NOT NULL,
    "collectorName" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "errorMessage" TEXT,
    "durationMs" INTEGER,
    "dataFreshnessSeconds" INTEGER,
    "fallbackUsed" BOOLEAN,
    "source" TEXT,
    "payloadHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectorRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramOverviewPost" (
    "id" TEXT NOT NULL,
    "overviewId" TEXT NOT NULL,
    "messageId" TEXT,
    "chatId" TEXT NOT NULL,
    "session" TEXT NOT NULL,
    "messageIndex" INTEGER,
    "text" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "errorMessage" TEXT,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramOverviewPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OverviewLlmUsage" (
    "id" TEXT NOT NULL,
    "overviewId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "promptVersion" TEXT,
    "session" TEXT,
    "costEstimate" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OverviewLlmUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActiveSetup" (
    "id" TEXT NOT NULL,
    "setupId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "setupType" TEXT NOT NULL,
    "timeframeSource" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "relevantZoneLow" DOUBLE PRECISION,
    "relevantZoneHigh" DOUBLE PRECISION,
    "invalidation" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActiveSetup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchedulerLock" (
    "id" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchedulerLock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ActiveSetup_setupId_key" ON "ActiveSetup"("setupId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionOverview_runKey_key" ON "SessionOverview"("runKey");
