import { z } from "zod";
import { artifactGroundingSourceSchema } from "../grounding";

export function createTaskAgentArtifactSchemas<
  const Kind extends "animation" | "presentation",
  Content,
  Draft,
>(kind: Kind, contentSchema: z.ZodType<Content>, generationDraftSchema: z.ZodType<Draft>) {
  const revisionSchema = z
    .object({
      artifactId: z.string().uuid(),
      content: contentSchema,
      contentSha256: z.string().regex(/^[0-9a-f]{64}$/),
      createdAt: z.iso.datetime(),
      id: z.string().uuid(),
      parentRevisionId: z.string().uuid().nullable(),
      revisionNumber: z.number().int().min(1),
    })
    .strict();

  const artifactSchema = z
    .object({
      createdAt: z.iso.datetime(),
      currentRevision: revisionSchema,
      groundingSources: z.array(artifactGroundingSourceSchema).optional(),
      id: z.string().uuid(),
      title: z.string().trim().min(1).max(200),
      updatedAt: z.iso.datetime(),
      workspaceId: z.string().uuid(),
    })
    .strict();

  const detailBase = z
    .object({
      createdAt: z.iso.datetime(),
      failureCode: z.string().trim().min(1).max(100).nullable(),
      generationAttemptId: z.string().uuid().nullable(),
      generationDraft: generationDraftSchema.nullable(),
      generationSequence: z.number().int().min(0),
      id: z.string().uuid(),
      kind: z.literal(kind),
      title: z.string().trim().min(1).max(200),
      updatedAt: z.iso.datetime(),
      workspaceId: z.string().uuid(),
    })
    .strict();

  const detailSchema = z.discriminatedUnion("generationState", [
    detailBase.extend({
      artifact: z.null(),
      failureCode: z.null(),
      generationState: z.enum(["queued", "generating", "finalizing"]),
    }),
    detailBase.extend({
      artifact: z.null(),
      failureCode: z.string().trim().min(1).max(100),
      generationState: z.literal("failed"),
    }),
    detailBase.extend({
      artifact: z.null(),
      failureCode: z.null(),
      generationAttemptId: z.null(),
      generationState: z.literal("cancelled"),
    }),
    detailBase.extend({
      artifact: artifactSchema,
      failureCode: z.null(),
      generationDraft: z.null(),
      generationState: z.literal("ready"),
    }),
  ]);

  return { artifactSchema, detailSchema, revisionSchema };
}
