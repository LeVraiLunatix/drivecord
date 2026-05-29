-- CreateTable
CREATE TABLE "DriveFile" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "driveId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL DEFAULT '',
    "filename" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT '',
    "chunkSize" INTEGER NOT NULL,
    "chunks" JSONB NOT NULL,
    "tags" TEXT[],
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "trashed" BOOLEAN NOT NULL DEFAULT false,
    "trashedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriveFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriveFolder" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "driveId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "color" TEXT,
    "trashed" BOOLEAN NOT NULL DEFAULT false,
    "trashedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriveFolder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DriveFile_webhookId_parentId_idx" ON "DriveFile"("webhookId", "parentId");

-- CreateIndex
CREATE INDEX "DriveFile_webhookId_trashed_idx" ON "DriveFile"("webhookId", "trashed");

-- CreateIndex
CREATE INDEX "DriveFile_webhookId_favorite_idx" ON "DriveFile"("webhookId", "favorite");

-- CreateIndex
CREATE INDEX "DriveFolder_webhookId_parentId_idx" ON "DriveFolder"("webhookId", "parentId");

-- CreateIndex
CREATE INDEX "DriveFolder_webhookId_trashed_idx" ON "DriveFolder"("webhookId", "trashed");

-- AddForeignKey
ALTER TABLE "DriveFile" ADD CONSTRAINT "DriveFile_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriveFolder" ADD CONSTRAINT "DriveFolder_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
