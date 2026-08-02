import "server-only";

import { database } from "@/database/client";
import { emptyArtifactGroundingBundle } from "../grounding";
import type { ArtifactCreationInput, ArtifactServerModule } from "../server-contract.server";
import { taskAgentRemoteCancellation } from "../task-agent/cancellation.server";
import { createAnimationDbosQueue } from "./dbos";
import { AnimationError } from "./errors";
import {
  deleteAnimationForConversation,
  getAnimationDetailForConversation,
  purgeDeletedAnimationContent,
  startAnimationGeneration,
} from "./service";

export const animationServerModule = {
  cancelGeneration: taskAgentRemoteCancellation("animation-remotion-v1"),
  createFromAgent: (input: ArtifactCreationInput<"animation">) =>
    startAnimationGeneration(
      input.actor,
      {
        conversationId: input.conversationId,
        ...(input.durationSeconds ? { durationSeconds: input.durationSeconds } : {}),
        grounding: input.grounding ?? emptyArtifactGroundingBundle(),
        locale: input.locale,
        prompt: input.prompt,
        ...(input.requestedTitle ? { requestedTitle: input.requestedTitle } : {}),
        rootRunId: input.rootRunId ?? null,
        sourcePlanItemId: input.sourcePlanItemId ?? null,
        sourceUserMessageId: input.sourceUserMessageId,
        workspaceId: input.workspaceId,
      },
      createAnimationDbosQueue(),
    ),
  delete: async (actor, lookup, db = database) => {
    await deleteAnimationForConversation(actor, lookup, db);
  },
  getDetail: (actor, lookup, db = database) => getAnimationDetailForConversation(actor, lookup, db),
  isNotFoundError: (error: unknown) => error instanceof AnimationError,
  kind: "animation" as const,
  purge: async (artifactId: string, db = database) => {
    await purgeDeletedAnimationContent(artifactId, db);
  },
} satisfies ArtifactServerModule<"animation">;
