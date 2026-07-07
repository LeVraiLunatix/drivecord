-- Opt-out de la page publique « Nos mécènes » (additif, sans risque).
-- À lancer une fois : npx prisma db execute --file prisma/patreon-supporters.sql
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "hideFromSupporters" BOOLEAN NOT NULL DEFAULT false;
