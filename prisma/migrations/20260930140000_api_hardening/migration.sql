-- AlterTable
ALTER TABLE "ApiKey" ADD COLUMN "revokedAt" TIMESTAMP(3),
ADD COLUMN "allowedOrigins" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Share" ADD COLUMN "disabledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ApiAuditLog" (
    "id" TEXT NOT NULL,
    "apiKeyId" TEXT,
    "appId" TEXT,
    "userId" TEXT,
    "route" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "ip" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkReport" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handledAt" TIMESTAMP(3),

    CONSTRAINT "LinkReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApiAuditLog_createdAt_idx" ON "ApiAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "ApiAuditLog_apiKeyId_createdAt_idx" ON "ApiAuditLog"("apiKeyId", "createdAt");

-- CreateIndex
CREATE INDEX "LinkReport_token_idx" ON "LinkReport"("token");

-- CreateIndex
CREATE INDEX "LinkReport_handledAt_createdAt_idx" ON "LinkReport"("handledAt", "createdAt");
