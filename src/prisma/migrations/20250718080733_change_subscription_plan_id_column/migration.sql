/*
  Warnings:

  - You are about to drop the column `subscription_plan_id` on the `SubscriptionPlanBuy` table. All the data in the column will be lost.
  - Added the required column `subscription_plan` to the `SubscriptionPlanBuy` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "SubscriptionPlanBuy" DROP CONSTRAINT "SubscriptionPlanBuy_subscription_plan_id_fkey";

-- AlterTable
ALTER TABLE "SubscriptionPlanBuy" DROP COLUMN "subscription_plan_id",
ADD COLUMN     "subscription_plan" JSONB NOT NULL;
