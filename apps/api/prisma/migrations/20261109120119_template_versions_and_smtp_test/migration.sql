-- AlterTable
ALTER TABLE "smtp_configs" ADD COLUMN     "last_test_at" TIMESTAMP(3),
ADD COLUMN     "last_test_ok" BOOLEAN;

-- CreateTable
CREATE TABLE "mail_template_versions" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "subject_tpl" TEXT NOT NULL,
    "body_html_tpl" TEXT NOT NULL,
    "body_text_tpl" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mail_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mail_template_versions_template_id_version_key" ON "mail_template_versions"("template_id", "version");

-- AddForeignKey
ALTER TABLE "mail_template_versions" ADD CONSTRAINT "mail_template_versions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "mail_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
