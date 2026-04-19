ALTER TABLE "Project"
ADD COLUMN "nameSource" TEXT NOT NULL DEFAULT 'default',
ADD COLUMN "nameUpdatedAt" TIMESTAMP(3),
ADD COLUMN "nameGenerationRequestedAt" TIMESTAMP(3);

ALTER TABLE "GenerationSession"
ADD COLUMN "displayTitleGenerationRequestedAt" TIMESTAMP(3);

ALTER TABLE "SessionRun"
ADD COLUMN "titleGenerationRequestedAt" TIMESTAMP(3);
