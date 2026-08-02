import { z } from "zod";
import { artifactGroundingSourceSchema } from "@/features/artifacts/grounding";
import { mindMapDraftSnapshotSchema, mindMapRevisionContentSchema } from "./contract";

const mindMapRevisionSchema = z
  .object({
    artifactId: z.string().uuid(),
    content: mindMapRevisionContentSchema,
    contentSha256: z.string().regex(/^[0-9a-f]{64}$/),
    createdAt: z.iso.datetime(),
    id: z.string().uuid(),
    parentRevisionId: z.string().uuid().nullable(),
    revisionNumber: z.number().int().min(1),
  })
  .strict();

export const mindMapArtifactSchema = z
  .object({
    createdAt: z.iso.datetime(),
    currentRevision: mindMapRevisionSchema,
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
    draft: mindMapDraftSnapshotSchema.nullable(),
    failureCode: z.string().trim().min(1).max(100).nullable(),
    generationAttemptId: z.string().uuid().nullable(),
    generationSequence: z.number().int().min(0),
    id: z.string().uuid(),
    kind: z.literal("mind_map"),
    title: z.string().trim().min(1).max(200),
    updatedAt: z.iso.datetime(),
    workspaceId: z.string().uuid(),
  })
  .strict();

export const mindMapDetailSchema = z.discriminatedUnion("generationState", [
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
    draft: z.null(),
    failureCode: z.null(),
    generationAttemptId: z.null(),
    generationState: z.literal("cancelled"),
  }),
  detailBase.extend({
    artifact: mindMapArtifactSchema,
    draft: z.null(),
    failureCode: z.null(),
    generationState: z.literal("ready"),
  }),
]);

export type MindMapArtifact = z.infer<typeof mindMapArtifactSchema>;
export type MindMapDetail = z.infer<typeof mindMapDetailSchema>;
