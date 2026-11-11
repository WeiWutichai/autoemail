-- DropIndex
DROP INDEX "suppressed_emails_email_key";

-- AlterTable
ALTER TABLE "suppressed_emails" ADD COLUMN     "connection_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "suppressed_emails_email_connection_id_key" ON "suppressed_emails"("email", "connection_id");

-- AddForeignKey
ALTER TABLE "suppressed_emails" ADD CONSTRAINT "suppressed_emails_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "erp_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

