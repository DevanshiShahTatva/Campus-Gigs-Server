/*
  Warnings:

  - You are about to drop the column `paypal_plan_id` on the `SubscriptionPlanBuy` table. All the data in the column will be lost.
  - You are about to drop the column `paypal_product_id` on the `SubscriptionPlanBuy` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN     "paypal_plan_id" TEXT,
ADD COLUMN     "paypal_product_id" TEXT;

-- AlterTable
ALTER TABLE "SubscriptionPlanBuy" DROP COLUMN "paypal_plan_id",
DROP COLUMN "paypal_product_id";
