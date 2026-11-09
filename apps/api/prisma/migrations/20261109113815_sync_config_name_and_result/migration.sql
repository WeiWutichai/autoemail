-- AlterTable: existing rows get their kind as a placeholder name.
ALTER TABLE "erp_sync_configs" ADD COLUMN     "last_error" TEXT,
ADD COLUMN     "last_result" JSONB,
ADD COLUMN     "name" TEXT NOT NULL DEFAULT 'sync';

UPDATE "erp_sync_configs" SET "name" = lower("kind"::text);

ALTER TABLE "erp_sync_configs" ALTER COLUMN "name" DROP DEFAULT;
