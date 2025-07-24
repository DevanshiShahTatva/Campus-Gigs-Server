/*
  Warnings:

  - You are about to drop the column `has_reminder_sent` on the `SubscriptionPlan` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Gigs" ADD COLUMN     "has_reminder_sent" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SubscriptionPlan" DROP COLUMN "has_reminder_sent";
