/*
  Warnings:

  - Added the required column `user_id` to the `SnapshotSubscriptionPlan` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "SnapshotSubscriptionPlan" ADD COLUMN     "user_id" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "SnapshotSubscriptionPlan" ADD CONSTRAINT "SnapshotSubscriptionPlan_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
