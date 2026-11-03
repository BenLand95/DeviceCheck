-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "RunType" AS ENUM ('MANUAL', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETE', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "report_enabled" BOOLEAN NOT NULL DEFAULT true,
    "report_timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "offline_threshold_seconds" INTEGER NOT NULL DEFAULT 180,
    "schedule_cron" TEXT,
    "schedule_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "signageos_device_uid" TEXT NOT NULL,
    "last_status" TEXT,
    "last_alive_at" TIMESTAMP(3),
    "last_checked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_recipients" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "run_type" "RunType" NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'QUEUED',
    "file_path" TEXT,
    "device_count" INTEGER NOT NULL DEFAULT 0,
    "online_count" INTEGER NOT NULL DEFAULT 0,
    "offline_count" INTEGER NOT NULL DEFAULT 0,
    "unknown_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "devices_signageos_device_uid_idx" ON "devices"("signageos_device_uid");

-- CreateIndex
CREATE INDEX "devices_customer_id_idx" ON "devices"("customer_id");

-- CreateIndex
CREATE INDEX "customer_recipients_customer_id_idx" ON "customer_recipients"("customer_id");

-- CreateIndex
CREATE INDEX "reports_customer_id_idx" ON "reports"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_settings_key_key" ON "app_settings"("key");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_recipients" ADD CONSTRAINT "customer_recipients_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
