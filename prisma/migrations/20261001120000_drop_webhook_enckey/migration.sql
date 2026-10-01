-- Legacy cleanup: the server no longer holds any drive key.
-- Safety net: refuse to drop the column while any drive still stores a key.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Webhook" WHERE "encKey" IS NOT NULL) THEN
    RAISE EXCEPTION 'Webhook.encKey still holds keys: run scripts/e2ee-migration-status.mjs and wait for READY';
  END IF;
END $$;

-- AlterTable
ALTER TABLE "Webhook" DROP COLUMN "encKey";
