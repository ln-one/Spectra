ALTER TABLE "GenerationSession"
ADD COLUMN "baseVersionId" TEXT;

ALTER TABLE "GenerationSession"
ADD CONSTRAINT "GenerationSession_baseVersionId_fkey"
FOREIGN KEY ("baseVersionId") REFERENCES "ProjectVersion"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "GenerationSession_projectId_baseVersionId_idx"
ON "GenerationSession"("projectId", "baseVersionId");
