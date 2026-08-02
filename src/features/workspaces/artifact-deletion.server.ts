import "server-only";

import { type Database, database } from "@/database/client";
import { deleteArtifactForConversationWithCleanup } from "@/features/artifacts/workbench-server";
import type { Actor } from "@/features/identity/types";
import { createArtifactCleanupQueue } from "@/features/maintenance/cleanup-dbos";

export async function deleteWorkbenchArtifact(
  actor: Actor,
  input: { artifactId: string; conversationId: string; workspaceId: string },
  db: Database = database,
) {
  const cleanupQueue = createArtifactCleanupQueue();
  await deleteArtifactForConversationWithCleanup(actor, input, cleanupQueue, db);
}
