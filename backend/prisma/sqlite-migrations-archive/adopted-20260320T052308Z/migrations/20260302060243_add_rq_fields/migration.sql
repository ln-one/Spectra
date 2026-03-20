-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GenerationTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
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
    CONSTRAINT "GenerationTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_GenerationTask" ("createdAt", "errorMessage", "id", "inputData", "outputUrls", "progress", "projectId", "status", "taskType", "updatedAt") SELECT "createdAt", "errorMessage", "id", "inputData", "outputUrls", "progress", "projectId", "status", "taskType", "updatedAt" FROM "GenerationTask";
DROP TABLE "GenerationTask";
ALTER TABLE "new_GenerationTask" RENAME TO "GenerationTask";
CREATE INDEX "GenerationTask_projectId_status_idx" ON "GenerationTask"("projectId", "status");
CREATE INDEX "GenerationTask_rqJobId_idx" ON "GenerationTask"("rqJobId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
