-- Add email verification fields to User table

-- Add new columns
ALTER TABLE "User" 
ADD COLUMN "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "emailVerificationCode" TEXT,
ADD COLUMN "verificationCodeExpiry" TIMESTAMP(3);

-- Add index for faster lookups
CREATE INDEX "User_emailVerificationCode_idx" ON "User"("emailVerificationCode");
