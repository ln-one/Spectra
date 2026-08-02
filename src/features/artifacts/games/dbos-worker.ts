import "server-only";

import type { Pool } from "pg";
import type { Database } from "@/database/client";
import { registerStructuredArtifactDbosWorkflow } from "../structured-generation-dbos.server";
import { gameGenerationProfile } from "./config";
import { GAME_DBOS_WORKFLOW } from "./dbos";
import { type GameGenerator, generateGame } from "./generation";
import { gameGenerationFailureCode } from "./generation-failure";
import {
  claimGameGeneration,
  completeGameGeneration,
  failGameGeneration,
  finalizeGameGeneration,
  getGameGenerationInputById,
} from "./service";

export function registerGameDbosWorkflow(input: {
  db: Database;
  generate?: GameGenerator;
  pool: Pool;
}) {
  return registerStructuredArtifactDbosWorkflow({
    claim: claimGameGeneration,
    complete: completeGameGeneration,
    dataSourceName: "spectra-game-product",
    db: input.db,
    fail: failGameGeneration,
    failureCode: gameGenerationFailureCode,
    finalizeState: finalizeGameGeneration,
    generate: input.generate ?? generateGame,
    kind: "game",
    load: getGameGenerationInputById,
    modelId: gameGenerationProfile.modelId,
    names: {
      fail: "failGameGeneration",
      finalize: "finalizeGameGeneration",
      generate: "generateGameContent",
      load: "loadGameGeneration",
      workflow: GAME_DBOS_WORKFLOW,
    },
    pool: input.pool,
  });
}
