-- CreateEnum
CREATE TYPE "PRIORITY" AS ENUM ('high', 'medium', 'low');

-- AlterTable
ALTER TABLE "Gigs" ADD COLUMN     "priority" "PRIORITY" NOT NULL DEFAULT 'low';
