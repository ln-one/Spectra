import "server-only";

import { database } from "@/database/client";
import { emptyArtifactGroundingBundle } from "../grounding";
import type { ArtifactCreationInput, ArtifactServerModule } from "../server-contract.server";
import { createQuizDbosQueue } from "./dbos";
import { QuizError } from "./errors";
import {
  deleteQuizForConversation,
  getQuizDetailForConversation,
  purgeDeletedQuizContent,
  startQuizGeneration,
} from "./service";

export const quizServerModule = {
  createFromAgent: (input: ArtifactCreationInput) =>
    startQuizGeneration(
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
      createQuizDbosQueue(),
    ),
  delete: async (actor, lookup, db = database) => {
    await deleteQuizForConversation(actor, lookup, db);
  },
  getDetail: (actor, lookup, db = database) => getQuizDetailForConversation(actor, lookup, db),
  isNotFoundError: (error: unknown) => error instanceof QuizError,
  kind: "quiz" as const,
  purge: async (artifactId: string, db = database) => {
    await purgeDeletedQuizContent(artifactId, db);
  },
} satisfies ArtifactServerModule<"quiz">;
