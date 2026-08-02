import "server-only";

import { eq } from "drizzle-orm";
import { gameRuns } from "@/database/schema";
import { createStructuredArtifactService } from "../structured-artifact-service.server";
import { flapRevivalGameRevisionContentSchema, gameGenerationRequestSchema } from "./contract";
import { GameError } from "./errors";

const service = createStructuredArtifactService({
  conflictError: () => new GameError("game_conflict"),
  contentSchema: flapRevivalGameRevisionContentSchema,
  errorLabel: "Game",
  generationMetadata: { profileVersion: "flap-revival-v1" },
  kind: "game",
  notFoundError: () => new GameError("game_not_found"),
  purgeResources: async (artifactId, db) => {
    await db.delete(gameRuns).where(eq(gameRuns.artifactId, artifactId));
  },
  requestSchema: gameGenerationRequestSchema,
});

export const claimGameGeneration = service.claimGeneration;
export const completeGameGeneration = service.completeGeneration;
export const deleteGameForConversation = service.deleteForConversation;
export const failGameGeneration = service.failGeneration;
export const finalizeGameGeneration = service.finalizeGeneration;
export const getGameDetailForConversation = service.getDetailForConversation;
export const getGameGenerationInputById = service.getGenerationInputById;
export const purgeDeletedGameContent = service.purgeDeletedContent;
export const saveGameRevision = service.saveRevision;
export const startGameGeneration = service.startGeneration;
