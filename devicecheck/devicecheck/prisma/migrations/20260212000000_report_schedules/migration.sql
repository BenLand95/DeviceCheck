-- CreateEnum
CREATE TYPE "ScheduleFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateTable
CREATE TABLE "report_schedules" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "frequency" "ScheduleFrequency" NOT NULL,
    "time" TEXT NOT NULL,
    "day_of_week" INTEGER,
    "day_of_month" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "report_schedules_customer_id_idx" ON "report_schedules"("customer_id");

-- AddForeignKey
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop old schedule columns from customers
ALTER TABLE "customers" DROP COLUMN IF EXISTS "schedule_cron";
ALTER TABLE "customers" DROP COLUMN IF EXISTS "schedule_enabled";
