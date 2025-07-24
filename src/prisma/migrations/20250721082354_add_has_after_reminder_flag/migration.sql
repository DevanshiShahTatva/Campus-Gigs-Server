/*
  Warnings:

  - You are about to drop the column `has_reminder_sent` on the `Gigs` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Gigs" DROP COLUMN "has_reminder_sent",
ADD COLUMN     "has_after_reminder_sent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "has_before_reminder_sent" BOOLEAN NOT NULL DEFAULT false;
