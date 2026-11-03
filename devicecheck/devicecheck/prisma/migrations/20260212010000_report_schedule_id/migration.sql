-- Add schedule_id column to reports table
ALTER TABLE "reports" ADD COLUMN "schedule_id" TEXT;

-- Create index on schedule_id
CREATE INDEX "reports_schedule_id_idx" ON "reports"("schedule_id");

-- Add foreign key constraint
ALTER TABLE "reports" ADD CONSTRAINT "reports_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "report_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
