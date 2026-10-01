-- CreateTable
CREATE TABLE "UploadSession" (
    "id" TEXT NOT NULL,
    "apiKeyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL DEFAULT '',
    "expectedChunks" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UploadSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadChunk" (
    "sessionId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "size" INTEGER NOT NULL,
    "messageId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "urlExpiresAt" TIMESTAMP(3),

    CONSTRAINT "UploadChunk_pkey" PRIMARY KEY ("sessionId","index")
);

-- CreateIndex
CREATE INDEX "UploadSession_apiKeyId_idx" ON "UploadSession"("apiKeyId");

-- CreateIndex
CREATE INDEX "UploadSession_status_expiresAt_idx" ON "UploadSession"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadChunk" ADD CONSTRAINT "UploadChunk_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "UploadSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
