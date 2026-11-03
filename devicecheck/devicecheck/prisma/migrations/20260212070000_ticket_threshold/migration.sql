-- AlterTable: Add ticket_threshold_seconds column to customers
ALTER TABLE "customers" ADD COLUMN "ticket_threshold_seconds" INTEGER NOT NULL DEFAULT 86400;
