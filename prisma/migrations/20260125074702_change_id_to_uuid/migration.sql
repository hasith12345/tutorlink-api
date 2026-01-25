/*
  Warnings:

  - The primary key for the `Student` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Tutor` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `User` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/

-- Step 1: Add new UUID columns as temporary columns
ALTER TABLE "User" ADD COLUMN "id_new" UUID DEFAULT gen_random_uuid();
UPDATE "User" SET "id_new" = gen_random_uuid();
ALTER TABLE "User" ALTER COLUMN "id_new" SET NOT NULL;

ALTER TABLE "Student" ADD COLUMN "id_new" UUID DEFAULT gen_random_uuid();
ALTER TABLE "Student" ADD COLUMN "userId_new" UUID;
UPDATE "Student" SET "id_new" = gen_random_uuid();
ALTER TABLE "Student" ALTER COLUMN "id_new" SET NOT NULL;

ALTER TABLE "Tutor" ADD COLUMN "id_new" UUID DEFAULT gen_random_uuid();
ALTER TABLE "Tutor" ADD COLUMN "userId_new" UUID;
UPDATE "Tutor" SET "id_new" = gen_random_uuid();
ALTER TABLE "Tutor" ALTER COLUMN "id_new" SET NOT NULL;

-- Step 2: Update foreign keys in Student and Tutor to match User's new UUIDs
UPDATE "Student" s SET "userId_new" = u."id_new" FROM "User" u WHERE s."userId" = u."id";
UPDATE "Tutor" t SET "userId_new" = u."id_new" FROM "User" u WHERE t."userId" = u."id";

-- Step 3: Drop foreign key constraints
ALTER TABLE "Student" DROP CONSTRAINT IF EXISTS "Student_userId_fkey";
ALTER TABLE "Tutor" DROP CONSTRAINT IF EXISTS "Tutor_userId_fkey";

-- Step 4: Drop old primary keys and unique constraints
ALTER TABLE "Student" DROP CONSTRAINT IF EXISTS "Student_pkey";
ALTER TABLE "Student" DROP CONSTRAINT IF EXISTS "Student_userId_key";
ALTER TABLE "Tutor" DROP CONSTRAINT IF EXISTS "Tutor_pkey";
ALTER TABLE "Tutor" DROP CONSTRAINT IF EXISTS "Tutor_userId_key";
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_pkey";

ALTER TABLE "Student" DROP COLUMN "id";
ALTER TABLE "Student" DROP COLUMN "userId";
ALTER TABLE "Tutor" DROP COLUMN "id";
ALTER TABLE "Tutor" DROP COLUMN "userId";
ALTER TABLE "User" DROP COLUMN "id";

-- Step 5: Rename new columns to original names
ALTER TABLE "User" RENAME COLUMN "id_new" TO "id";
ALTER TABLE "Student" RENAME COLUMN "id_new" TO "id";
ALTER TABLE "Student" RENAME COLUMN "userId_new" TO "userId";
ALTER TABLE "Tutor" RENAME COLUMN "id_new" TO "id";
ALTER TABLE "Tutor" RENAME COLUMN "userId_new" TO "userId";

-- Step 6: Add primary keys back
ALTER TABLE "User" ADD CONSTRAINT "User_pkey" PRIMARY KEY ("id");
ALTER TABLE "Student" ADD CONSTRAINT "Student_pkey" PRIMARY KEY ("id");
ALTER TABLE "Tutor" ADD CONSTRAINT "Tutor_pkey" PRIMARY KEY ("id");

-- Step 7: Make userId NOT NULL and add unique constraints
ALTER TABLE "Student" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Tutor" ALTER COLUMN "userId" SET NOT NULL;

-- Step 8: Recreate unique constraints
CREATE UNIQUE INDEX "Student_userId_key" ON "Student"("userId");
CREATE UNIQUE INDEX "Tutor_userId_key" ON "Tutor"("userId");

-- Step 9: Add foreign key constraints back
ALTER TABLE "Student" ADD CONSTRAINT "Student_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Tutor" ADD CONSTRAINT "Tutor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
