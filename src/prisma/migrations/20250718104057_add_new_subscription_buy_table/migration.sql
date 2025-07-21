/*
  Warnings:

  - You are about to drop the column `subscription_plan` on the `SubscriptionPlanBuy` table. All the data in the column will be lost.
  - Added the required column `subscription_plan_id` to the `SubscriptionPlanBuy` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "SubscriptionPlanBuy" DROP COLUMN "subscription_plan",
ADD COLUMN     "subscription_plan_id" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "SnapshotSubscriptionPlan" (
    "id" SERIAL NOT NULL,
    "base_plan_id" INTEGER,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "is_pro" BOOLEAN NOT NULL DEFAULT false,
    "roles_allowed" "PROFILE_TYPE"[],
    "max_bid_per_month" INTEGER DEFAULT 0,
    "max_gig_per_month" INTEGER DEFAULT 0,
    "features" TEXT[],
    "can_get_badge" BOOLEAN NOT NULL DEFAULT false,
    "most_popular" BOOLEAN NOT NULL DEFAULT false,
    "button_text" TEXT,
    "icon" TEXT,
    "paypal_product_id" TEXT,
    "paypal_plan_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SnapshotSubscriptionPlan_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "SnapshotSubscriptionPlan" ADD CONSTRAINT "SnapshotSubscriptionPlan_base_plan_id_fkey" FOREIGN KEY ("base_plan_id") REFERENCES "SubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPlanBuy" ADD CONSTRAINT "SubscriptionPlanBuy_subscription_plan_id_fkey" FOREIGN KEY ("subscription_plan_id") REFERENCES "SnapshotSubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
