-- CreateTable
CREATE TABLE "PromptSuggestionCache" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'generating',
    "suggestionsJson" TEXT,
    "summary" TEXT,
    "sourceFingerprint" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "generatedAt" TIMESTAMP(3),
    "refreshRequestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromptSuggestionCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PromptSuggestionCache_projectId_surface_key" ON "PromptSuggestionCache"("projectId", "surface");

-- CreateIndex
CREATE INDEX "PromptSuggestionCache_projectId_status_idx" ON "PromptSuggestionCache"("projectId", "status");

-- CreateIndex
CREATE INDEX "PromptSuggestionCache_projectId_updatedAt_idx" ON "PromptSuggestionCache"("projectId", "updatedAt");

-- AddForeignKey
ALTER TABLE "PromptSuggestionCache" ADD CONSTRAINT "PromptSuggestionCache_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;