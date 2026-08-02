import { z } from "zod";
import { artifactGroundingBundleSchema } from "@/features/artifacts/grounding";
import { taskAgentAttemptPhaseSchema } from "@/features/artifacts/task-agent/attempt";
import {
  PRESENTATION_DRAFT_MAX_FILE_BYTES,
  PRESENTATION_DRAFT_MAX_TOTAL_BYTES,
} from "./editor-policy";

const presentationStageSchema = taskAgentAttemptPhaseSchema.exclude(["rendering"]);
const presentationDraftPreviewSchema = z
  .object({
    pageMap: z.record(
      z.string().min(1).max(500),
      z.string().max(PRESENTATION_DRAFT_MAX_FILE_BYTES),
    ),
    pptdContent: z.string().min(1).max(PRESENTATION_DRAFT_MAX_FILE_BYTES),
    totalPages: z.number().int().positive().max(200),
  })
  .strict()
  .superRefine((preview, context) => {
    const characters =
      preview.pptdContent.length +
      Object.values(preview.pageMap).reduce((total, page) => total + page.length, 0);
    if (characters > PRESENTATION_DRAFT_MAX_TOTAL_BYTES) {
      context.addIssue({
        code: "custom",
        message: "Presentation draft preview exceeds the total size limit",
      });
    }
  });

export const presentationGenerationDraftSchema = z
  .object({
    schemaVersion: z.literal(1),
    phase: presentationStageSchema,
    preview: presentationDraftPreviewSchema.optional(),
  })
  .strict();

export const presentationRevisionContentSchema = z
  .object({
    schemaVersion: z.literal(1),
    editorProjectSha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
    editorSourceSha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
    pageCount: z.number().int().min(1).max(200),
    pageTitles: z.array(z.string().trim().min(1).max(300)).min(1).max(200),
    hasPptxRender: z.boolean().optional(),
    summary: z.string().trim().max(4_000),
    title: z.string().trim().min(1).max(200),
  })
  .strict()
  .superRefine((content, context) => {
    if (content.pageTitles.length !== content.pageCount) {
      context.addIssue({
        code: "custom",
        message: "Presentation page titles must match pageCount",
        path: ["pageTitles"],
      });
    }
  });

export const presentationGenerationRequestSchema = z
  .object({
    grounding: artifactGroundingBundleSchema.optional().default({ evidence: [], version: 1 }),
    locale: z.enum(["zh-CN", "en-US"]),
    prompt: z.string().trim().min(1).max(20_000),
    recipe: z.literal("presentation-pptd-v1"),
  })
  .strict();

export const presentationSourceManifestSchema = z
  .object({
    entrypoint: z.string().regex(/^out\/[a-zA-Z0-9._/-]+\.pptd$/),
    files: z
      .array(
        z
          .object({
            path: z.string().regex(/^out\/[a-zA-Z0-9._/-]+$/),
            sha256: z.string().regex(/^[0-9a-f]{64}$/),
            sizeBytes: z.number().int().positive(),
          })
          .strict(),
      )
      .min(1)
      .max(2_000),
    schemaVersion: z.literal(1),
  })
  .strict()
  .superRefine((manifest, context) => {
    const paths = manifest.files.map((file) => file.path);
    if (new Set(paths).size !== paths.length) {
      context.addIssue({
        code: "custom",
        message: "Source manifest paths must be unique",
      });
    }
    if (!paths.includes(manifest.entrypoint)) {
      context.addIssue({
        code: "custom",
        message: "Source manifest must include its entrypoint",
        path: ["entrypoint"],
      });
    }
  });

export type PresentationGenerationRequest = z.infer<typeof presentationGenerationRequestSchema>;
export type PresentationRevisionContent = z.infer<typeof presentationRevisionContentSchema>;
