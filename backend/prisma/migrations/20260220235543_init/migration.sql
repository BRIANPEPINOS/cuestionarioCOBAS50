/*
  Warnings:

  - You are about to drop the column `imageDataUrl` on the `Question` table. All the data in the column will be lost.
  - You are about to drop the column `imageMime` on the `Question` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Question` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Quiz` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `User` table. All the data in the column will be lost.
  - Made the column `explanation` on table `Question` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "Option_questionId_idx";

-- DropIndex
DROP INDEX "Question_origNo_idx";

-- DropIndex
DROP INDEX "Question_quizId_idx";

-- AlterTable
ALTER TABLE "Question" DROP COLUMN "imageDataUrl",
DROP COLUMN "imageMime",
DROP COLUMN "updatedAt",
ALTER COLUMN "explanation" SET NOT NULL;

-- AlterTable
ALTER TABLE "Quiz" DROP COLUMN "updatedAt";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "updatedAt";

-- CreateTable
CREATE TABLE "Image" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "dataUrl" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Image_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Image_questionId_key" ON "Image"("questionId");

-- AddForeignKey
ALTER TABLE "Image" ADD CONSTRAINT "Image_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
