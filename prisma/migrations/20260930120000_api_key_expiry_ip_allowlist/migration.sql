-- AlterTable
ALTER TABLE "ApiKey" ADD COLUMN "expiresAt" TIMESTAMP(3),
ADD COLUMN "allowedIps" TEXT[] DEFAULT ARRAY[]::TEXT[];
