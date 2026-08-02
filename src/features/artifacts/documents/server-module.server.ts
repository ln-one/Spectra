import "server-only";

import { database } from "@/database/client";
import { emptyArtifactGroundingBundle } from "../grounding";
import type { ArtifactCreationInput, ArtifactServerModule } from "../server-contract.server";
import { createTeachingDocumentDbosQueue } from "./dbos";
import { TeachingDocumentError } from "./errors";
import {
  deleteTeachingDocumentForConversation,
  getTeachingDocumentDetailForConversation,
  purgeDeletedTeachingDocumentContent,
  startTeachingDocumentGeneration,
} from "./service";

export const teachingDocumentServerModule = {
  createFromAgent: (input: ArtifactCreationInput) =>
    startTeachingDocumentGeneration(
      input.actor,
      {
        conversationId: input.conversationId,
        grounding: input.grounding ?? emptyArtifactGroundingBundle(),
        locale: input.locale,
        prompt: input.prompt,
        ...(input.requestedTitle ? { requestedTitle: input.requestedTitle } : {}),
        rootRunId: input.rootRunId ?? null,
        sourcePlanItemId: input.sourcePlanItemId ?? null,
        sourceUserMessageId: input.sourceUserMessageId,
        workspaceId: input.workspaceId,
      },
      createTeachingDocumentDbosQueue(),
    ),
  delete: async (actor, lookup, db = database) => {
    await deleteTeachingDocumentForConversation(actor, lookup, db);
  },
  getDetail: (actor, lookup, db = database) =>
    getTeachingDocumentDetailForConversation(actor, lookup, db),
  isNotFoundError: (error: unknown) => error instanceof TeachingDocumentError,
  kind: "teaching_document" as const,
  purge: (artifactId: string, db = database) => purgeDeletedTeachingDocumentContent(artifactId, db),
} satisfies ArtifactServerModule<"teaching_document">;
