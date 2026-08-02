import "server-only";

import { database } from "@/database/client";
import { emptyArtifactGroundingBundle } from "../grounding";
import type { ArtifactCreationInput, ArtifactServerModule } from "../server-contract.server";
import { taskAgentRemoteCancellation } from "../task-agent/cancellation.server";
import { createPresentationDbosQueue } from "./dbos";
import { PresentationError } from "./errors";
import {
  deletePresentationForConversation,
  getPresentationDetailForConversation,
  purgeDeletedPresentationContent,
  startPresentationGeneration,
} from "./service";

export const presentationServerModule = {
  cancelGeneration: taskAgentRemoteCancellation("presentation-pptd-v1"),
  createFromAgent: (input: ArtifactCreationInput) =>
    startPresentationGeneration(
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
      createPresentationDbosQueue(),
    ),
  delete: async (actor, lookup, db = database) => {
    await deletePresentationForConversation(actor, lookup, db);
  },
  getDetail: (actor, lookup, db = database) =>
    getPresentationDetailForConversation(actor, lookup, db),
  isNotFoundError: (error: unknown) => error instanceof PresentationError,
  kind: "presentation" as const,
  purge: async (artifactId: string, db = database) => {
    await purgeDeletedPresentationContent(artifactId, db);
  },
} satisfies ArtifactServerModule<"presentation">;
