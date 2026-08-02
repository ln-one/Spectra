import { z } from "zod";
import { artifactGenerationStateSchema, artifactKindSchema } from "@/features/artifacts/types";

export const listArtifactsToolInputSchema = z
  .object({ limit: z.coerce.number().int().min(1).max(20).default(10) })
  .strict();

const artifactReadCursorSchema = z
  .union([z.number().int().min(0), z.string().regex(/^\d+$/)])
  .default(0);

export const listArtifactsToolOutputSchema = z
  .object({
    artifacts: z.array(
      z
        .object({
          artifactId: z.string().uuid(),
          generationState: artifactGenerationStateSchema,
          kind: artifactKindSchema,
          title: z.string().trim().min(1).max(200),
          updatedAt: z.iso.datetime(),
        })
        .strict(),
    ),
  })
  .strict();

export const readTeachingDocumentToolInputSchema = z
  .object({
    artifactId: z.string().uuid(),
    cursor: artifactReadCursorSchema,
  })
  .strict();

const readTeachingDocumentToolOutputBaseSchema = z
  .object({
    artifactId: z.string().uuid(),
    failureCode: z.string().trim().min(1).max(100).nullable(),
    generationState: artifactGenerationStateSchema,
    kind: z.literal("teaching_document"),
    title: z.string().trim().min(1).max(200),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const readTeachingDocumentToolOutputSchema = z.discriminatedUnion("generationState", [
  readTeachingDocumentToolOutputBaseSchema.extend({
    contentMarkdown: z.null(),
    failureCode: z.null(),
    generationState: z.enum(["queued", "generating", "finalizing", "cancelled"]),
    nextCursor: z.null(),
  }),
  readTeachingDocumentToolOutputBaseSchema.extend({
    contentMarkdown: z.null(),
    failureCode: z.string().trim().min(1).max(100),
    generationState: z.literal("failed"),
    nextCursor: z.null(),
  }),
  readTeachingDocumentToolOutputBaseSchema.extend({
    contentMarkdown: z.string(),
    failureCode: z.null(),
    generationState: z.literal("ready"),
    nextCursor: z.number().int().min(0).nullable(),
  }),
]);

export const readMindMapToolInputSchema =
  readTeachingDocumentToolInputSchema.describe("Read mind map input");

const readMindMapToolOutputBaseSchema = readTeachingDocumentToolOutputBaseSchema.extend({
  kind: z.literal("mind_map"),
});

export const readMindMapToolOutputSchema = z.discriminatedUnion("generationState", [
  readMindMapToolOutputBaseSchema.extend({
    contentMarkdown: z.null(),
    failureCode: z.null(),
    generationState: z.enum(["queued", "generating", "finalizing", "cancelled"]),
    nextCursor: z.null(),
  }),
  readMindMapToolOutputBaseSchema.extend({
    contentMarkdown: z.null(),
    failureCode: z.string().trim().min(1).max(100),
    generationState: z.literal("failed"),
    nextCursor: z.null(),
  }),
  readMindMapToolOutputBaseSchema.extend({
    contentMarkdown: z.string(),
    failureCode: z.null(),
    generationState: z.literal("ready"),
    nextCursor: z.number().int().min(0).nullable(),
  }),
]);

export const readCurrentArtifactToolInputSchema = z
  .object({ cursor: artifactReadCursorSchema })
  .strict();

export const readCurrentArtifactToolOutputSchema = z
  .object({
    contentMarkdown: z.string().nullable(),
    failureCode: z.string().trim().min(1).max(100).nullable(),
    generationState: artifactGenerationStateSchema,
    kind: artifactKindSchema,
    nextCursor: z.number().int().min(0).nullable(),
    title: z.string().trim().min(1).max(200),
    updatedAt: z.iso.datetime(),
  })
  .strict();
