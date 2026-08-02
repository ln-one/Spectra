import "server-only";

import { DBOS_MAINTENANCE_QUEUE } from "@/database/dbos";
import { ARTIFACT_PLAN_DBOS_QUEUE } from "@/features/agents/artifact-plan-dbos.server";
import { TEACHING_DOCUMENT_DBOS_QUEUE } from "@/features/artifacts/documents/dbos";
import { ARTIFACT_SUGGESTIONS_QUEUE } from "@/features/artifacts/documents/suggestion-dbos";
import { GAME_DBOS_QUEUE } from "@/features/artifacts/games/dbos";
import { MIND_MAP_DBOS_QUEUE } from "@/features/artifacts/mind-maps/dbos";
import { PRESENTATION_AUTHORING_DBOS_QUEUE } from "@/features/artifacts/presentations/dbos";
import { PRESENTATION_REFINEMENT_DBOS_QUEUE } from "@/features/artifacts/presentations/refine-dbos";
import { QUIZ_DBOS_QUEUE } from "@/features/artifacts/quizzes/dbos";
import { ARTIFACT_RENDER_DBOS_QUEUE } from "@/features/artifacts/render-dbos";
import { KNOWLEDGE_INDEX_DBOS_QUEUE } from "@/features/knowledge/dbos";
import { SOURCE_INGESTION_DBOS_QUEUE } from "@/features/sources/ingestion/dbos";

export const DBOS_QUEUES = [
  { name: ARTIFACT_PLAN_DBOS_QUEUE, workerConcurrency: 2 },
  { name: TEACHING_DOCUMENT_DBOS_QUEUE, workerConcurrency: 3 },
  { name: MIND_MAP_DBOS_QUEUE, workerConcurrency: 3 },
  { name: QUIZ_DBOS_QUEUE, workerConcurrency: 3 },
  { name: GAME_DBOS_QUEUE, workerConcurrency: 3 },
  { name: PRESENTATION_AUTHORING_DBOS_QUEUE, workerConcurrency: 1 },
  { name: PRESENTATION_REFINEMENT_DBOS_QUEUE, workerConcurrency: 1 },
  { name: ARTIFACT_RENDER_DBOS_QUEUE, workerConcurrency: 2 },
  { name: SOURCE_INGESTION_DBOS_QUEUE, workerConcurrency: 1 },
  { name: KNOWLEDGE_INDEX_DBOS_QUEUE, workerConcurrency: 2 },
  { name: ARTIFACT_SUGGESTIONS_QUEUE, workerConcurrency: 2 },
  { name: DBOS_MAINTENANCE_QUEUE, workerConcurrency: 1 },
] as const;

export const DBOS_QUEUE_NAMES = DBOS_QUEUES.map((queue) => queue.name);

type QueueRegistryReader = {
  query: (text: string, values: string[][]) => Promise<{ rows: Array<{ name: string }> }>;
};

export async function assertDbosQueuesRegistered(pool: QueueRegistryReader) {
  const result = await pool.query("SELECT name FROM dbos.queues WHERE name = ANY($1::text[])", [
    DBOS_QUEUE_NAMES,
  ]);
  const registered = new Set(result.rows.map((row) => row.name));
  const missing = DBOS_QUEUE_NAMES.filter((name) => !registered.has(name));
  if (missing.length > 0) throw new Error(`DBOS queues are not registered: ${missing.join(", ")}`);
}
