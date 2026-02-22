/*
  Warnings:

  - You are about to drop the column `educationLevel` on the `Student` table. All the data in the column will be lost.
  - You are about to drop the column `grade` on the `Student` table. All the data in the column will be lost.
  - You are about to drop the column `learningMode` on the `Student` table. All the data in the column will be lost.
  - You are about to drop the column `subjects` on the `Student` table. All the data in the column will be lost.
  - You are about to drop the column `educationLevels` on the `Tutor` table. All the data in the column will be lost.
  - You are about to drop the column `experience` on the `Tutor` table. All the data in the column will be lost.
  - You are about to drop the column `subjects` on the `Tutor` table. All the data in the column will be lost.
  - You are about to drop the column `role` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Student" DROP COLUMN "educationLevel",
DROP COLUMN "grade",
DROP COLUMN "learningMode",
DROP COLUMN "subjects",
ADD COLUMN     "address" TEXT,
ADD COLUMN     "dob" TEXT,
ADD COLUMN     "parentName" TEXT,
ADD COLUMN     "parentPhone" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "schoolGrade" TEXT,
ADD COLUMN     "schoolName" TEXT;

-- AlterTable
ALTER TABLE "Tutor" DROP COLUMN "educationLevels",
DROP COLUMN "experience",
DROP COLUMN "subjects",
ADD COLUMN     "address" TEXT,
ADD COLUMN     "dob" TEXT,
ADD COLUMN     "idNumber" TEXT,
ADD COLUMN     "phone" TEXT;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "role",
ADD COLUMN     "emailVerificationCode" TEXT,
ADD COLUMN     "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "verificationCodeExpiry" TIMESTAMP(3);

-- DropEnum
DROP TYPE "Role";
