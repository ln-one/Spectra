import { z } from "zod";
import {
  PRESENTATION_DRAFT_MAX_FILE_BYTES,
  PRESENTATION_DRAFT_MAX_TOTAL_BYTES,
} from "./editor-policy";
import type { PresentationDetail } from "./types";

export const PRESENTATION_DRAFT_SEQUENCE_BASE = 1_000;

export const presentationDraftEventSchema = z
  .object({
    event: z.literal("page_updated"),
    kind: z.literal("presentation"),
    pageContent: z.string().min(1).max(PRESENTATION_DRAFT_MAX_FILE_BYTES),
    pageNumber: z.number().int().positive().max(200),
    pagePath: z.string().min(1).max(500),
    pptdContent: z.string().min(1).max(PRESENTATION_DRAFT_MAX_FILE_BYTES).optional(),
    sequence: z.number().int().positive(),
    totalPages: z.number().int().positive().max(200),
    version: z.literal(1),
  })
  .strict()
  .superRefine((event, context) => {
    if (event.pageNumber > event.totalPages) {
      context.addIssue({
        code: "custom",
        message: "pageNumber must not exceed totalPages",
        path: ["pageNumber"],
      });
    }
  });

export type PresentationDraftEvent = z.infer<typeof presentationDraftEventSchema>;

export function applyPresentationDraftEvent(
  detail: PresentationDetail,
  event: PresentationDraftEvent,
): PresentationDetail {
  if (
    detail.generationState !== "queued" &&
    detail.generationState !== "generating" &&
    detail.generationState !== "finalizing" &&
    detail.generationState !== "failed"
  ) {
    return detail;
  }
  if (event.sequence <= detail.generationSequence) return detail;
  const currentDraft = detail.generationDraft ?? {
    phase: "authoring" as const,
    schemaVersion: 1 as const,
  };
  const currentPreview =
    currentDraft.preview?.totalPages === event.totalPages ? currentDraft.preview : null;
  if (!currentPreview && !event.pptdContent) return detail;
  const pageMap = {
    ...(currentPreview?.pageMap ?? {}),
    [event.pagePath]: event.pageContent,
  };
  const previewCharacters =
    (event.pptdContent ?? currentPreview?.pptdContent ?? "").length +
    Object.values(pageMap).reduce((total, page) => total + page.length, 0);
  if (previewCharacters > PRESENTATION_DRAFT_MAX_TOTAL_BYTES) {
    return { ...detail, generationSequence: event.sequence };
  }
  return {
    ...detail,
    generationDraft: {
      ...currentDraft,
      preview: {
        pageMap,
        pptdContent: event.pptdContent ?? currentPreview?.pptdContent ?? "",
        totalPages: event.totalPages,
      },
    },
    generationSequence: event.sequence,
  };
}
