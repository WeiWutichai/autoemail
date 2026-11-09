-- AlterTable
ALTER TABLE "erp_sync_configs" ADD COLUMN     "smtp_config_id" UUID,
ADD COLUMN     "template_id" UUID;

-- AddForeignKey
ALTER TABLE "erp_sync_configs" ADD CONSTRAINT "erp_sync_configs_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "mail_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_sync_configs" ADD CONSTRAINT "erp_sync_configs_smtp_config_id_fkey" FOREIGN KEY ("smtp_config_id") REFERENCES "smtp_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
