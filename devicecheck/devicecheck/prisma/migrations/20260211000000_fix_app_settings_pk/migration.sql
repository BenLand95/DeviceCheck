-- AlterTable: Change app_settings primary key from "id" to "key"

-- Drop existing primary key constraint
ALTER TABLE "app_settings" DROP CONSTRAINT "app_settings_pkey";

-- Drop the unique index on "key" (it will become the PK)
DROP INDEX "app_settings_key_key";

-- Drop the "id" column
ALTER TABLE "app_settings" DROP COLUMN "id";

-- Add new primary key on "key"
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key");
