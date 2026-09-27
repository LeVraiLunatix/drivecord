-- AlterTable
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "UsedNativeCode" (
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsedNativeCode_pkey" PRIMARY KEY ("codeHash")
);

-- CreateIndex
CREATE INDEX "UsedNativeCode_expiresAt_idx" ON "UsedNativeCode"("expiresAt");
