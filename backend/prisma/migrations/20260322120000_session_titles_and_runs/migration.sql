ALTER TABLE "GenerationSession"
ADD COLUMN "displayTitle" TEXT,
ADD COLUMN "displayTitleSource" TEXT DEFAULT 'default',
ADD COLUMN "displayTitleUpdatedAt" TIMESTAMP(3);

CREATE TABLE "SessionRun" (
    "id" TEXT NOT NULL,
    "runScopeKey" TEXT NOT NULL,
    "sessionId" TEXT,
    "projectId" TEXT NOT NULL,
    "toolType" TEXT NOT NULL,
    "runNo" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "titleSource" TEXT NOT NULL DEFAULT 'pending',
    "titleUpdatedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "step" TEXT NOT NULL DEFAULT 'config',
    "artifactId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SessionRun_sessionId_updatedAt_idx" ON "SessionRun"("sessionId", "updatedAt");
CREATE INDEX "SessionRun_projectId_updatedAt_idx" ON "SessionRun"("projectId", "updatedAt");
CREATE INDEX "SessionRun_artifactId_idx" ON "SessionRun"("artifactId");
CREATE UNIQUE INDEX "SessionRun_runScopeKey_toolType_runNo_key" ON "SessionRun"("runScopeKey", "toolType", "runNo");

ALTER TABLE "SessionRun"
ADD CONSTRAINT "SessionRun_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "GenerationSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SessionRun"
ADD CONSTRAINT "SessionRun_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SessionRun"
ADD CONSTRAINT "SessionRun_artifactId_fkey"
FOREIGN KEY ("artifactId") REFERENCES "Artifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
