-- CreateEnum
CREATE TYPE "ContactSource" AS ENUM ('ERP', 'MANUAL');

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "source" "ContactSource" NOT NULL DEFAULT 'ERP',
ALTER COLUMN "connection_id" DROP NOT NULL,
ALTER COLUMN "erp_ref_id" DROP NOT NULL;

