-- Ajoute les colonnes du palier manuel Patreon (additif, sans risque).
-- À lancer une fois sur la prod : npx prisma db execute --file prisma/patreon-manual.sql
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "patreonManual" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "patreonExpiresAt" TIMESTAMP(3);
