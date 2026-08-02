import "server-only";

import { database } from "@/database/client";
import { emptyArtifactGroundingBundle } from "../grounding";
import type { ArtifactCreationInput, ArtifactServerModule } from "../server-contract.server";
import { createMindMapDbosQueue } from "./dbos";
import { MindMapError } from "./errors";
import {
  deleteMindMapForConversation,
  getMindMapDetailForConversation,
  purgeDeletedMindMapContent,
  startMindMapGeneration,
} from "./service";

export const mindMapServerModule = {
  createFromAgent: (input: ArtifactCreationInput) =>
    startMindMapGeneration(
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
      createMindMapDbosQueue(),
    ),
  delete: async (actor, lookup, db = database) => {
    await deleteMindMapForConversation(actor, lookup, db);
  },
  getDetail: (actor, lookup, db = database) => getMindMapDetailForConversation(actor, lookup, db),
  isNotFoundError: (error: unknown) => error instanceof MindMapError,
  kind: "mind_map" as const,
  purge: (artifactId: string, db = database) => purgeDeletedMindMapContent(artifactId, db),
} satisfies ArtifactServerModule<"mind_map">;
