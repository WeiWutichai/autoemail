-- CreateEnum
CREATE TYPE "DbType" AS ENUM ('MSSQL', 'ORACLE', 'MYSQL', 'POSTGRES');

-- CreateEnum
CREATE TYPE "SyncKind" AS ENUM ('CONTACTS', 'OUTBOX');

-- CreateEnum
CREATE TYPE "MailStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'DEAD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MailEvent" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'RETRY', 'DEAD', 'CANCELLED');

-- CreateTable
CREATE TABLE "admin_users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_sessions" (
    "id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp_connections" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "db_type" "DbType" NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "database" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_enc" TEXT,
    "ssl" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_test_at" TIMESTAMP(3),
    "last_test_ok" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "erp_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp_sync_configs" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "kind" "SyncKind" NOT NULL,
    "query_sql" TEXT,
    "column_mapping" JSONB,
    "poll_interval_sec" INTEGER NOT NULL DEFAULT 300,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_synced_at" TIMESTAMP(3),
    "last_cursor" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "erp_sync_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "erp_ref_id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "company" TEXT,
    "raw" JSONB,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smtp_configs" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "secure" BOOLEAN NOT NULL DEFAULT false,
    "username" TEXT,
    "password_enc" TEXT,
    "from_name" TEXT NOT NULL,
    "from_email" TEXT NOT NULL,
    "daily_limit" INTEGER NOT NULL DEFAULT 2000,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "smtp_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail_templates" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject_tpl" TEXT NOT NULL,
    "body_html_tpl" TEXT NOT NULL,
    "body_text_tpl" TEXT,
    "variables" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mail_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail_queue" (
    "id" UUID NOT NULL,
    "connection_id" UUID,
    "erp_ref_id" TEXT,
    "template_id" UUID,
    "template_version" INTEGER,
    "smtp_config_id" UUID,
    "to_addrs" TEXT[],
    "cc" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bcc" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "variables" JSONB,
    "rendered_subject" TEXT,
    "rendered_html" TEXT,
    "rendered_text" TEXT,
    "attachments" JSONB,
    "status" "MailStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMP(3),
    "scheduled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "message_id" TEXT,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mail_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail_logs" (
    "id" UUID NOT NULL,
    "queue_id" UUID NOT NULL,
    "event" "MailEvent" NOT NULL,
    "detail" TEXT,
    "smtp_response" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mail_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" UUID NOT NULL,
    "admin_id" UUID,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "diff" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE INDEX "admin_sessions_admin_id_idx" ON "admin_sessions"("admin_id");

-- CreateIndex
CREATE UNIQUE INDEX "erp_connections_name_key" ON "erp_connections"("name");

-- CreateIndex
CREATE INDEX "erp_sync_configs_connection_id_kind_idx" ON "erp_sync_configs"("connection_id", "kind");

-- CreateIndex
CREATE INDEX "contacts_email_idx" ON "contacts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_connection_id_erp_ref_id_key" ON "contacts"("connection_id", "erp_ref_id");

-- CreateIndex
CREATE UNIQUE INDEX "smtp_configs_name_key" ON "smtp_configs"("name");

-- CreateIndex
CREATE UNIQUE INDEX "mail_templates_code_key" ON "mail_templates"("code");

-- CreateIndex
CREATE INDEX "mail_queue_status_next_retry_at_idx" ON "mail_queue"("status", "next_retry_at");

-- CreateIndex
CREATE INDEX "mail_queue_created_at_idx" ON "mail_queue"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "mail_queue_connection_id_erp_ref_id_key" ON "mail_queue"("connection_id", "erp_ref_id");

-- CreateIndex
CREATE INDEX "mail_logs_queue_id_created_at_idx" ON "mail_logs"("queue_id", "created_at");

-- CreateIndex
CREATE INDEX "admin_audit_logs_admin_id_created_at_idx" ON "admin_audit_logs"("admin_id", "created_at");

-- AddForeignKey
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "erp_sync_configs" ADD CONSTRAINT "erp_sync_configs_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "erp_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "erp_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mail_queue" ADD CONSTRAINT "mail_queue_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "erp_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mail_queue" ADD CONSTRAINT "mail_queue_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "mail_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mail_queue" ADD CONSTRAINT "mail_queue_smtp_config_id_fkey" FOREIGN KEY ("smtp_config_id") REFERENCES "smtp_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mail_logs" ADD CONSTRAINT "mail_logs_queue_id_fkey" FOREIGN KEY ("queue_id") REFERENCES "mail_queue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
