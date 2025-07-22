-- AlterTable
ALTER TABLE "Gigs" ADD COLUMN     "has_after_reminder_sent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "has_before_reminder_sent" BOOLEAN NOT NULL DEFAULT false;
