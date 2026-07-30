-- AlterTable
ALTER TABLE "DriveFile" ADD COLUMN     "encIv" TEXT,
ADD COLUMN     "locked" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "hideFromSupporters" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "patreonExpiresAt" TIMESTAMP(3),
ADD COLUMN     "patreonManual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "patreonSyncedAt" TIMESTAMP(3),
ADD COLUMN     "patreonTier" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "vaultPin" TEXT,
ADD COLUMN     "vaultSalt" TEXT;

-- CreateTable
CREATE TABLE "Share" (
    "token" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "passwordHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Share_pkey" PRIMARY KEY ("token")
);

-- CreateIndex
CREATE INDEX "Share_fileId_idx" ON "Share"("fileId");

-- AddForeignKey
ALTER TABLE "Share" ADD CONSTRAINT "Share_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
