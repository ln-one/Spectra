ALTER TABLE "User"
ADD COLUMN "identityId" TEXT;

CREATE UNIQUE INDEX "User_identityId_key" ON "User"("identityId");
CREATE INDEX "User_identityId_idx" ON "User"("identityId");
