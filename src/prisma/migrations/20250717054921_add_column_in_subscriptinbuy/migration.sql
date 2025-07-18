-- AlterTable
ALTER TABLE "PaymentHistory" ADD COLUMN     "is_deleted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SubscriptionPlanBuy" ADD COLUMN     "is_auto_debit" BOOLEAN NOT NULL DEFAULT false;
