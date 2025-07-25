/*
  Warnings:

  - A unique constraint covering the columns `[stripe_account_id]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "User_stripe_account_id_key" ON "User"("stripe_account_id");
