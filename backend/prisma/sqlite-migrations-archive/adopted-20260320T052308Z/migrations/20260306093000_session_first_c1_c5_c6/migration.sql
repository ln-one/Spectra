-- CreateTable
CREATE TABLE "GenerationSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'IDLE',
    "stateReason" TEXT,
    "outputType" TEXT NOT NULL,
    "options" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "currentOutlineVersion" INTEGER NOT NULL DEFAULT 0,
    "renderVersion" INTEGER NOT NULL DEFAULT 0,
    "pptUrl" TEXT,
    "wordUrl" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "errorRetryable" BOOLEAN NOT NULL DEFAULT false,
    "resumable" BOOLEAN NOT NULL DEFAULT false,
    "lastCursor" TEXT,
    "clientSessionId" TEXT,
    "fallbacksJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GenerationSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OutlineVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "outlineData" TEXT NOT NULL,
    "changeReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OutlineVersion_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GenerationSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SessionEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "stateReason" TEXT,
    "progress" INTEGER,
    "cursor" TEXT NOT NULL,
    "payload" TEXT,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SessionEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GenerationSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "sessionId" TEXT,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Conversation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Conversation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GenerationSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Conversation" ("content", "createdAt", "id", "metadata", "projectId", "role") SELECT "content", "createdAt", "id", "metadata", "projectId", "role" FROM "Conversation";
DROP TABLE "Conversation";
ALTER TABLE "new_Conversation" RENAME TO "Conversation";
CREATE INDEX "Conversation_projectId_createdAt_idx" ON "Conversation"("projectId", "createdAt");
CREATE INDEX "Conversation_projectId_sessionId_createdAt_idx" ON "Conversation"("projectId", "sessionId", "createdAt");
CREATE TABLE "new_GenerationTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "sessionId" TEXT,
    "taskType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "rqJobId" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "inputData" TEXT,
    "outputUrls" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GenerationTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GenerationTask_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GenerationSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_GenerationTask" ("createdAt", "errorMessage", "id", "inputData", "outputUrls", "progress", "projectId", "retryCount", "rqJobId", "status", "taskType", "updatedAt") SELECT "createdAt", "errorMessage", "id", "inputData", "outputUrls", "progress", "projectId", "retryCount", "rqJobId", "status", "taskType", "updatedAt" FROM "GenerationTask";
DROP TABLE "GenerationTask";
ALTER TABLE "new_GenerationTask" RENAME TO "GenerationTask";
CREATE INDEX "GenerationTask_projectId_status_idx" ON "GenerationTask"("projectId", "status");
CREATE INDEX "GenerationTask_rqJobId_idx" ON "GenerationTask"("rqJobId");
CREATE INDEX "GenerationTask_sessionId_idx" ON "GenerationTask"("sessionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "GenerationSession_projectId_state_idx" ON "GenerationSession"("projectId", "state");

-- CreateIndex
CREATE INDEX "GenerationSession_userId_state_idx" ON "GenerationSession"("userId", "state");

-- CreateIndex
CREATE INDEX "GenerationSession_clientSessionId_idx" ON "GenerationSession"("clientSessionId");

-- CreateIndex
CREATE INDEX "OutlineVersion_sessionId_version_idx" ON "OutlineVersion"("sessionId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "OutlineVersion_sessionId_version_key" ON "OutlineVersion"("sessionId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "SessionEvent_cursor_key" ON "SessionEvent"("cursor");

-- CreateIndex
CREATE INDEX "SessionEvent_sessionId_cursor_idx" ON "SessionEvent"("sessionId", "cursor");

-- CreateIndex
CREATE INDEX "SessionEvent_sessionId_createdAt_idx" ON "SessionEvent"("sessionId", "createdAt");

