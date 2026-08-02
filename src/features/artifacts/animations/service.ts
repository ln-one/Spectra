import "server-only";

import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { type Database, database } from "@/database/client";
import { artifactRenderJobs, artifacts } from "@/database/schema";
import { artifactGenerationStartInputSchema } from "@/features/artifacts/generation";
import {
  type ArtifactRenderStorage,
  createArtifactRenderStorage,
} from "@/features/artifacts/render-storage.server";
import { animationExecutionEnabled } from "@/features/artifacts/task-agent/config.server";
import { createTaskAgentGenerationLifecycle } from "@/features/artifacts/task-agent/generation-lifecycle.server";
import type { Actor } from "@/features/identity/types";
import type { TaskAgentGenerationQueue } from "../task-agent/generation-queue";
import {
  ANIMATION_RENDERER_VERSION,
  type AnimationRevisionContent,
  animationGenerationDraftSchema,
  animationGenerationRequestSchema,
  animationRevisionContentSchema,
} from "./contract";
import { AnimationError } from "./errors";
import type { AnimationDetail } from "./types";

export const ANIMATION_MEDIA_TYPES = {
  mp4: "video/mp4",
} as const;
export type AnimationRenderFormat = keyof typeof ANIMATION_MEDIA_TYPES;
const MAX_ANIMATION_RANGE_BYTES = 8 * 1024 * 1024;
const animationStages = ["provisioning", "authoring", "rendering", "publishing"] as const;
const animationGenerationStartInputSchema = artifactGenerationStartInputSchema.extend({
  durationSeconds: z.number().int().min(15).max(60).optional(),
});

const animationGenerationLifecycle = createTaskAgentGenerationLifecycle({
  contentSchema: animationRevisionContentSchema,
  draftSchema: animationGenerationDraftSchema,
  errorLabel: "Animation",
  kind: "animation",
  notFoundError: () => new AnimationError("animation_not_found"),
  recipeVersion: "animation-remotion-v1",
  requestSchema: animationGenerationRequestSchema,
  stages: animationStages,
  titleOf: (content) => content.title,
});

export function parseAnimationByteRange(header: string, sizeBytes: number) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    return null;
  }
  const suffixLength = !match[1] && match[2] ? Number(match[2]) : null;
  const start =
    suffixLength === null
      ? Number(match[1])
      : Math.max(0, sizeBytes - Math.min(suffixLength, MAX_ANIMATION_RANGE_BYTES));
  const requestedEnd = suffixLength === null && match[2] ? Number(match[2]) : sizeBytes - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    (suffixLength !== null && (!Number.isSafeInteger(suffixLength) || suffixLength <= 0)) ||
    start < 0 ||
    requestedEnd < start ||
    start >= sizeBytes
  ) {
    return null;
  }
  return {
    end: Math.min(requestedEnd, sizeBytes - 1, start + MAX_ANIMATION_RANGE_BYTES - 1),
    start,
  };
}

export async function startAnimationGeneration(
  actor: Actor,
  input: z.input<typeof animationGenerationStartInputSchema>,
  queue: TaskAgentGenerationQueue,
  db: Database = database,
): Promise<AnimationDetail> {
  const parsed = animationGenerationStartInputSchema.parse(input);
  await animationGenerationLifecycle.requirePrivateArtifactCreate(actor, parsed.workspaceId, db);
  const request = animationGenerationRequestSchema.parse({
    durationSeconds: parsed.durationSeconds ?? 30,
    grounding: parsed.grounding,
    locale: parsed.locale,
    prompt: parsed.prompt,
    recipe: "animation-remotion-v1",
  });
  const result = await animationGenerationLifecycle.startGeneration(
    {
      actorId: actor.principalId,
      conversationId: parsed.conversationId,
      generationRequest: request,
      rootRunId: parsed.rootRunId ?? null,
      sourcePlanItemId: parsed.sourcePlanItemId ?? null,
      sourceUserMessageId: parsed.sourceUserMessageId,
      title:
        parsed.requestedTitle ??
        parsed.prompt.normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, 200),
      workspaceId: parsed.workspaceId,
    },
    queue,
    db,
  );
  return animationGenerationLifecycle.toDetail(result.artifact, result.revision);
}

export async function getAnimationDetailForConversation(
  actor: Actor,
  input: { artifactId: string; conversationId: string; workspaceId: string },
  db: Database = database,
): Promise<AnimationDetail> {
  return animationGenerationLifecycle.getDetailForConversation(actor, input, db);
}

export async function getAnimationGenerationInputById(artifactId: string, db: Database = database) {
  return animationGenerationLifecycle.getGenerationInputById(artifactId, db);
}

export const claimAnimationGeneration = animationGenerationLifecycle.claimGeneration;
export const updateAnimationStage = animationGenerationLifecycle.updateStage;
export const failAnimationGeneration = animationGenerationLifecycle.failGeneration;

type PublishedOutput = {
  objectKey: string;
  objectVersionId: string;
  sha256: string;
  sizeBytes: number;
};

export async function completeAnimationGeneration(
  input: {
    actorId: string;
    artifactId: string;
    attemptId: string;
    content: AnimationRevisionContent;
    outputs: Record<AnimationRenderFormat, PublishedOutput>;
  },
  db: Database = database,
) {
  const outputSchema = z
    .object({
      objectKey: z.string().min(1).max(512),
      objectVersionId: z.string().min(1).max(255),
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
      sizeBytes: z.number().int().positive(),
    })
    .strict();
  const outputs = z
    .object({
      mp4: outputSchema,
    })
    .strict()
    .parse(input.outputs);
  const result = await animationGenerationLifecycle.completeGeneration(
    {
      actorId: input.actorId,
      artifactId: input.artifactId,
      attemptId: input.attemptId,
      content: input.content,
      publishResources: async (transaction, { revision }) => {
        const now = new Date();
        const inserted = await transaction
          .insert(artifactRenderJobs)
          .values(
            (Object.entries(outputs) as Array<[AnimationRenderFormat, PublishedOutput]>).map(
              ([format, output]) => ({
                artifactId: input.artifactId,
                artifactRevisionId: revision.id,
                attemptNumber: 1,
                failureCode: null,
                finishedAt: now,
                format,
                outputMediaType: ANIMATION_MEDIA_TYPES[format],
                outputObjectKey: output.objectKey,
                outputObjectVersionId: output.objectVersionId,
                outputSha256: output.sha256,
                outputSizeBytes: output.sizeBytes,
                rendererVersion: ANIMATION_RENDERER_VERSION,
                startedAt: now,
                state: "ready" as const,
              }),
            ),
          )
          .returning({ id: artifactRenderJobs.id });
        if (inserted.length !== 1) throw new Error("animation_output_not_published");
      },
    },
    db,
  );
  return animationGenerationLifecycle.toArtifact(result.artifact, result.revision);
}

export async function getAnimationRender(
  actor: Actor,
  input: {
    artifactId: string;
    conversationId: string;
    format: AnimationRenderFormat;
    range?: string;
    revisionId: string;
    workspaceId: string;
  },
  options: {
    allowPublishedSource?: boolean;
    db?: Database;
    storage?: ArtifactRenderStorage;
  } = {},
) {
  const db = options.db ?? database;
  if (!options.allowPublishedSource) {
    await animationGenerationLifecycle.requirePrivateArtifactManage(actor, input, db);
  }
  const detail = await getAnimationDetailForConversation(
    actor,
    {
      artifactId: input.artifactId,
      conversationId: input.conversationId,
      workspaceId: input.workspaceId,
    },
    db,
  );
  if (
    detail.generationState !== "ready" ||
    detail.artifact.currentRevision.id !== input.revisionId
  ) {
    return null;
  }
  if (!options.allowPublishedSource) {
    const [owned] = await db
      .select({ id: artifacts.id })
      .from(artifacts)
      .where(
        and(
          eq(artifacts.id, input.artifactId),
          eq(artifacts.createdByPrincipalId, actor.principalId),
        ),
      )
      .limit(1);
    if (!owned) return null;
  }
  const [render] = await db
    .select()
    .from(artifactRenderJobs)
    .where(
      and(
        eq(artifactRenderJobs.artifactId, input.artifactId),
        eq(artifactRenderJobs.artifactRevisionId, input.revisionId),
        eq(artifactRenderJobs.format, input.format),
        eq(artifactRenderJobs.state, "ready"),
      ),
    )
    .limit(1);
  if (!render?.outputObjectKey || !render.outputObjectVersionId) return null;
  if (!render.outputSizeBytes || !render.outputSha256 || render.outputSizeBytes <= 0) {
    throw new Error("animation_render_object_conflict");
  }
  const storage = options.storage ?? createArtifactRenderStorage();
  const range = input.range
    ? parseAnimationByteRange(input.range, render.outputSizeBytes)
    : undefined;
  if (input.range && !range) {
    return { sizeBytes: render.outputSizeBytes, unsatisfied: true as const };
  }
  const object = range
    ? await (() => {
        if (!storage.getRange) throw new Error("animation_range_storage_unavailable");
        return storage.getRange({
          ...range,
          key: render.outputObjectKey,
          versionId: render.outputObjectVersionId,
        });
      })()
    : await storage.get({
        key: render.outputObjectKey,
        versionId: render.outputObjectVersionId,
      });
  if (
    object.contentType !== ANIMATION_MEDIA_TYPES[input.format] ||
    (range
      ? object.body.byteLength !== range.end - range.start + 1
      : object.body.byteLength !== render.outputSizeBytes ||
        createHash("sha256").update(object.body).digest("hex") !== render.outputSha256)
  ) {
    throw new Error("animation_render_object_conflict");
  }
  const safeTitle =
    detail.artifact.currentRevision.content.title
      .normalize("NFKC")
      .replace(/[<>:"/\\|?*]/g, " ")
      .replace(/\p{Cc}/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "animation";
  return {
    ...object,
    filename: `${safeTitle}.mp4`,
    ...(range ? { range } : {}),
    sizeBytes: render.outputSizeBytes,
    unsatisfied: false as const,
  };
}

export function deleteAnimationForConversation(
  actor: Actor,
  input: { artifactId: string; conversationId: string; workspaceId: string },
  db: Database = database,
) {
  return animationGenerationLifecycle.tombstone(actor, input, db);
}

export async function retryAnimationGeneration(
  actor: Actor,
  input: { artifactId: string; conversationId: string; workspaceId: string },
  queue: TaskAgentGenerationQueue,
  db: Database = database,
  runtimeAvailable = animationExecutionEnabled(),
) {
  await animationGenerationLifecycle.requirePrivateArtifactManage(actor, input, db);
  const detail = await getAnimationDetailForConversation(actor, input, db);
  if (!runtimeAvailable) throw new AnimationError("animation_runtime_unavailable");
  if (detail.generationState !== "failed") throw new AnimationError("animation_not_retryable");
  const artifact = await animationGenerationLifecycle.retryGeneration(detail.id, queue, db);
  return animationGenerationLifecycle.toDetail(artifact, null);
}

export async function purgeDeletedAnimationContent(artifactId: string, db: Database = database) {
  await animationGenerationLifecycle.purgeDeletedContent(artifactId, db);
}
