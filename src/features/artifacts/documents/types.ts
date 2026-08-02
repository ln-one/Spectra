import { z } from "zod";
import { artifactGroundingSourceSchema } from "@/features/artifacts/grounding";
import { artifactHistoryItemSchema } from "@/features/artifacts/types";
import {
  teachingDocumentGenerationDraftSchema,
  teachingDocumentRevisionContentSchema,
} from "./contract";

const teachingDocumentRevisionSchema = z
  .object({
    artifactId: z.string().uuid(),
    content: teachingDocumentRevisionContentSchema,
    contentSha256: z.string().regex(/^[0-9a-f]{64}$/),
    createdAt: z.iso.datetime(),
    id: z.string().uuid(),
    parentRevisionId: z.string().uuid().nullable(),
    revisionNumber: z.number().int().min(1),
  })
  .strict();

export const teachingDocumentArtifactSchema = z
  .object({
    createdAt: z.iso.datetime(),
    currentRevision: teachingDocumentRevisionSchema,
    groundingSources: z.array(artifactGroundingSourceSchema).optional(),
    id: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    updatedAt: z.iso.datetime(),
    workspaceId: z.string().uuid(),
  })
  .strict();

const teachingDocumentHistoryItemSchema = z
  .object(artifactHistoryItemSchema.shape)
  .extend({ kind: z.literal("teaching_document") })
  .strict();

const teachingDocumentDetailBaseSchema = z
  .object({
    createdAt: z.iso.datetime(),
    draft: teachingDocumentGenerationDraftSchema.nullable(),
    failureCode: z.string().trim().min(1).max(100).nullable(),
    id: z.string().uuid(),
    kind: z.literal("teaching_document"),
    generationAttemptId: z.string().uuid().nullable(),
    generationSequence: z.number().int().min(0),
    title: z.string().trim().min(1).max(200),
    updatedAt: z.iso.datetime(),
    workspaceId: z.string().uuid(),
  })
  .strict();

export const teachingDocumentDetailSchema = z.discriminatedUnion("generationState", [
  teachingDocumentDetailBaseSchema.extend({
    artifact: z.null(),
    generationState: z.enum(["queued", "generating", "finalizing"]),
    failureCode: z.null(),
  }),
  teachingDocumentDetailBaseSchema.extend({
    artifact: z.null(),
    generationState: z.literal("failed"),
    failureCode: z.string().trim().min(1).max(100),
  }),
  teachingDocumentDetailBaseSchema.extend({
    artifact: z.null(),
    draft: z.null(),
    generationAttemptId: z.null(),
    generationState: z.literal("cancelled"),
    failureCode: z.null(),
  }),
  teachingDocumentDetailBaseSchema.extend({
    artifact: teachingDocumentArtifactSchema,
    draft: z.null(),
    failureCode: z.null(),
    generationState: z.literal("ready"),
  }),
]);

export type TeachingDocumentRevision = z.infer<typeof teachingDocumentRevisionSchema>;
export type TeachingDocumentArtifact = z.infer<typeof teachingDocumentArtifactSchema>;
export type TeachingDocumentHistoryItem = z.infer<typeof teachingDocumentHistoryItemSchema>;
export type TeachingDocumentDetail = z.infer<typeof teachingDocumentDetailSchema>;
