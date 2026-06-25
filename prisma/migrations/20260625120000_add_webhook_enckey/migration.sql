-- AlterTable: per-drive file-encryption key, AES-256-GCM encrypted (base64).
-- Nullable + additive — safe, non-destructive (existing rows get NULL).
ALTER TABLE "Webhook" ADD COLUMN "encKey" TEXT;
