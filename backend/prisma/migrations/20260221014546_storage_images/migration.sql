/*
  Warnings:

  - The primary key for the `Option` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `Option` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `isCorrect` column on the `Option` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `Question` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `Question` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `Quiz` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `Quiz` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the `Image` table. If the table is not empty, all the data it contains will be lost.
  - Changed the type of `questionId` on the `Option` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `quizId` on the `Question` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "Image" DROP CONSTRAINT "Image_questionId_fkey";

-- DropForeignKey
ALTER TABLE "Option" DROP CONSTRAINT "Option_questionId_fkey";

-- DropForeignKey
ALTER TABLE "Question" DROP CONSTRAINT "Question_quizId_fkey";

-- DropIndex
DROP INDEX "Option_questionId_optIndex_key";

-- AlterTable
ALTER TABLE "Option" DROP CONSTRAINT "Option_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "questionId",
ADD COLUMN     "questionId" INTEGER NOT NULL,
DROP COLUMN "isCorrect",
ADD COLUMN     "isCorrect" INTEGER NOT NULL DEFAULT 0,
ADD CONSTRAINT "Option_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Question" DROP CONSTRAINT "Question_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
DROP COLUMN "quizId",
ADD COLUMN     "quizId" INTEGER NOT NULL,
ALTER COLUMN "origNo" DROP NOT NULL,
ALTER COLUMN "origNo" DROP DEFAULT,
ALTER COLUMN "explanation" DROP NOT NULL,
ADD CONSTRAINT "Question_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Quiz" DROP CONSTRAINT "Quiz_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id");

-- DropTable
DROP TABLE "Image";

-- CreateTable
CREATE TABLE "QuestionImage" (
    "id" SERIAL NOT NULL,
    "questionId" INTEGER NOT NULL,
    "bucket" TEXT NOT NULL DEFAULT 'question-images',
    "path" TEXT NOT NULL,
    "mime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuestionImage_questionId_key" ON "QuestionImage"("questionId");

-- CreateIndex
CREATE INDEX "Option_questionId_idx" ON "Option"("questionId");

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Option" ADD CONSTRAINT "Option_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionImage" ADD CONSTRAINT "QuestionImage_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
