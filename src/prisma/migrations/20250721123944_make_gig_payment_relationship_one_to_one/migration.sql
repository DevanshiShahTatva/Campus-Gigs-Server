/*
  Warnings:

  - A unique constraint covering the columns `[gig_id]` on the table `GigPayment` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "GigPayment_gig_id_key" ON "GigPayment"("gig_id");
