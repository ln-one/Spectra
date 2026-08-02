import { z } from "zod";
import { artifactGroundingSourceSchema } from "./grounding";

export function createStructuredArtifactSchemas<const Kind extends "game" | "quiz", Content>(
  kind: Kind,
  contentSchema: z.ZodType<Content>,
) {
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
      generationState: z.enum(["queued", "generating", "finalizing"]),
      failureCode: z.null(),
    }),
    detailBase.extend({
      artifact: z.null(),
      generationState: z.literal("failed"),
      failureCode: z.string().trim().min(1).max(100),
    }),
    detailBase.extend({
      artifact: z.null(),
      generationState: z.literal("cancelled"),
      failureCode: z.null(),
      generationAttemptId: z.null(),
    }),
    detailBase.extend({
      artifact: artifactSchema,
      generationState: z.literal("ready"),
      failureCode: z.null(),
    }),
  ]);
  return { artifactSchema, detailSchema, revisionSchema };
}
