-- Add happyfox_contact_id to customers
ALTER TABLE "customers" ADD COLUMN "happyfox_contact_id" INTEGER;

-- Create device_tickets table
CREATE TABLE "device_tickets" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "ticket_id" INTEGER NOT NULL,
    "ticket_display_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "occurrence_num" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_tickets_pkey" PRIMARY KEY ("id")
);

-- Create indexes
CREATE INDEX "device_tickets_device_id_idx" ON "device_tickets"("device_id");
CREATE INDEX "device_tickets_ticket_id_idx" ON "device_tickets"("ticket_id");

-- Add foreign key
ALTER TABLE "device_tickets" ADD CONSTRAINT "device_tickets_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
