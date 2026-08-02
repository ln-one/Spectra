import "server-only";

import { database } from "@/database/client";
import { emptyArtifactGroundingBundle } from "../grounding";
import type { ArtifactCreationInput, ArtifactServerModule } from "../server-contract.server";
import { createGameDbosQueue } from "./dbos";
import { GameError } from "./errors";
import {
  deleteGameForConversation,
  getGameDetailForConversation,
  purgeDeletedGameContent,
  startGameGeneration,
} from "./service";

export const gameServerModule = {
  createFromAgent: (input: ArtifactCreationInput) =>
    startGameGeneration(
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
      createGameDbosQueue(),
    ),
  delete: async (actor, lookup, db = database) => {
    await deleteGameForConversation(actor, lookup, db);
  },
  getDetail: (actor, lookup, db = database) => getGameDetailForConversation(actor, lookup, db),
  isNotFoundError: (error: unknown) => error instanceof GameError,
  kind: "game" as const,
  purge: async (artifactId: string, db = database) => {
    await purgeDeletedGameContent(artifactId, db);
  },
} satisfies ArtifactServerModule<"game">;
