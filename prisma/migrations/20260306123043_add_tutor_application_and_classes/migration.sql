-- AlterTable
ALTER TABLE "Tutor" ADD COLUMN     "applicationStatus" TEXT NOT NULL DEFAULT 'NOT_SUBMITTED',
ADD COLUMN     "cvUrl" TEXT,
ADD COLUMN     "qualifications" TEXT;

-- CreateTable
CREATE TABLE "Class" (
    "id" UUID NOT NULL,
    "tutorId" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "venue" TEXT,
    "mode" TEXT NOT NULL,
    "location" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "time" TEXT NOT NULL,
    "duration" TEXT NOT NULL,
    "fees" INTEGER NOT NULL,
    "maxStudents" INTEGER NOT NULL DEFAULT 10,
    "enrolledCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Class_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "Tutor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
