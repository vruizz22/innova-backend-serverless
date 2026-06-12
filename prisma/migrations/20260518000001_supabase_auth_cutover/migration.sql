-- M8: Supabase Auth cutover — rename cognitoSub to supabaseUid
ALTER TABLE "User" RENAME COLUMN "cognitoSub" TO "supabaseUid";

DROP INDEX IF EXISTS "User_cognitoSub_key";

CREATE UNIQUE INDEX "User_supabaseUid_key" ON "User"("supabaseUid");
