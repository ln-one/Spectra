import "server-only";

import { createArtifactGenerationDbosQueue } from "../dbos-queue.server";
import type { TeachingDocumentGenerationQueue } from "./generation-queue";
import { teachingDocumentGenerationJobSchema } from "./generation-queue";

export const TEACHING_DOCUMENT_DBOS_QUEUE = "teaching-document-generation";
export const TEACHING_DOCUMENT_DBOS_WORKFLOW = "generateTeachingDocument";

export function createTeachingDocumentDbosQueue(): TeachingDocumentGenerationQueue {
  return createArtifactGenerationDbosQueue({
    errorLabel: "Teaching document",
    jobSchema: teachingDocumentGenerationJobSchema,
    queueName: TEACHING_DOCUMENT_DBOS_QUEUE,
    workflowName: TEACHING_DOCUMENT_DBOS_WORKFLOW,
  });
}
