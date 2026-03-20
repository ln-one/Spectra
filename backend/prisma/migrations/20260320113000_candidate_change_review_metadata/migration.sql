ALTER TABLE "CandidateChange"
ADD COLUMN "reviewedBy" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3);

CREATE INDEX "CandidateChange_projectId_sessionId_status_idx"
ON "CandidateChange"("projectId", "sessionId", "status");
