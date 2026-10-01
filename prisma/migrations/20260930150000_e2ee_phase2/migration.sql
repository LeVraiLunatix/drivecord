-- AlterTable
ALTER TABLE "Webhook" ADD COLUMN "dkWrapped" TEXT,
ADD COLUMN "e2eeVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "vaultKdf" JSONB;

-- AlterTable
ALTER TABLE "DriveFile" ADD COLUMN "fkWrapped" TEXT,
ADD COLUMN "encMeta" TEXT,
ADD COLUMN "cryptoVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "noncePrefix" TEXT;

-- AlterTable
ALTER TABLE "DriveFolder" ADD COLUMN "encName" TEXT;

-- AlterTable
ALTER TABLE "Share" ADD COLUMN "fkWrappedForShare" TEXT,
ADD COLUMN "shareKdf" JSONB;

-- CreateTable
CREATE TABLE "UserKeys" (
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "mkWrappedRecovery" TEXT NOT NULL,
    "mkWrappedPhrase" TEXT,
    "phraseKdf" JSONB,
    "mkWrappedPasskey" JSONB NOT NULL DEFAULT '{}',
    "publicKeyX25519" TEXT NOT NULL,
    "privateKeyWrapped" TEXT NOT NULL,
    "vaultKeyWrapped" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserKeys_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "KeyTransferRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "commitment" TEXT NOT NULL,
    "approverNonce" TEXT,
    "requesterPublicKey" TEXT,
    "requesterNonce" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approverPublicKey" TEXT,
    "sealedMk" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KeyTransferRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KeyTransferRequest_userId_status_idx" ON "KeyTransferRequest"("userId", "status");

-- AddForeignKey
ALTER TABLE "UserKeys" ADD CONSTRAINT "UserKeys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeyTransferRequest" ADD CONSTRAINT "KeyTransferRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
