-- CreateEnum
CREATE TYPE "DeviceSystem" AS ENUM ('SIGNAGEOS', 'REFLECTVIEW');

-- AlterTable: Add system column to devices
ALTER TABLE "devices" ADD COLUMN "system" "DeviceSystem" NOT NULL DEFAULT 'SIGNAGEOS';

-- AlterTable: Add send_email column to report_schedules
ALTER TABLE "report_schedules" ADD COLUMN "send_email" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable: Add report_offline_only column to customers
ALTER TABLE "customers" ADD COLUMN "report_offline_only" BOOLEAN NOT NULL DEFAULT false;
