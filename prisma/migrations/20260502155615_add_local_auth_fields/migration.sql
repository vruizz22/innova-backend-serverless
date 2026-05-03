-- AlterTable
ALTER TABLE "User" ADD COLUMN     "authRole" TEXT,
ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "passwordResetExpiresAt" TIMESTAMP(3),
ADD COLUMN     "passwordResetTokenHash" TEXT,
ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;
