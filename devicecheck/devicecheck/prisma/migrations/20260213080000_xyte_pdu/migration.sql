-- AlterTable: Add xyte_pdu_enabled to customers
ALTER TABLE "customers" ADD COLUMN "xyte_pdu_enabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: Add pdu_device_id and pdu_port to devices
ALTER TABLE "devices" ADD COLUMN "pdu_device_id" TEXT;
ALTER TABLE "devices" ADD COLUMN "pdu_port" INTEGER;
