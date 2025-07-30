-- AlterTable
ALTER TABLE "NotificationPreferences" ADD COLUMN     "show_payment" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "show_rating" BOOLEAN NOT NULL DEFAULT true;
