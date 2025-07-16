-- AlterTable
ALTER TABLE "Complaint" ADD COLUMN     "admin_feedback" TEXT,
ADD COLUMN     "outcome" "OUTCOME" NOT NULL DEFAULT 'pending',
ADD COLUMN     "what_provider_done" TEXT;

-- AlterTable
ALTER TABLE "Rating" ADD COLUMN     "created_by_id" INTEGER;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
