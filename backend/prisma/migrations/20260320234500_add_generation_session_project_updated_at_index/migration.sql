-- Improve /generate/sessions list query (project filter + updatedAt sort)
CREATE INDEX IF NOT EXISTS "GenerationSession_projectId_updatedAt_idx"
ON "GenerationSession" ("projectId", "updatedAt");
