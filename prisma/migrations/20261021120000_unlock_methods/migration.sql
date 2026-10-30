-- AlterTable
ALTER TABLE "UserKeys" ADD COLUMN "mkWrappedPin" TEXT,
ADD COLUMN "pinKdf" JSONB,
ADD COLUMN "pinVerifier" TEXT,
ADD COLUMN "pinFails" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "mkWrappedShares" TEXT,
ADD COLUMN "sharesMeta" JSONB;
