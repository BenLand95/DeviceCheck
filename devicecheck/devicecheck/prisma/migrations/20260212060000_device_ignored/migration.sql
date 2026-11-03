-- AlterTable: Add ignored column to devices
ALTER TABLE "devices" ADD COLUMN "ignored" BOOLEAN NOT NULL DEFAULT false;
