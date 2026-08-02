import { z } from "zod";
import {
  type TeachingDocumentGenerationDraft,
  teachingDocumentGenerationDraftSchema,
} from "./contract";

const eventBase = {
  kind: z.literal("teaching_document"),
  sequence: z.number().int().positive(),
  version: z.literal(3),
};

export const TEACHING_DOCUMENT_TERMINAL_SEQUENCE = Number.MAX_SAFE_INTEGER;

export const teachingDocumentDraftEventSchema = z.discriminatedUnion("event", [
  z
    .object({
      ...eventBase,
      delta: z.string().min(1),
      event: z.literal("text_delta"),
      startOffset: z.number().int().min(0),
    })
    .strict(),
  z
    .object({
      ...eventBase,
      contentSha256: z.string().regex(/^[0-9a-f]{64}$/),
      event: z.enum(["completed", "partial_completed"]),
      revisionId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      ...eventBase,
      event: z.literal("failed"),
      failureCode: z.string().trim().min(1).max(100),
    })
    .strict(),
]);

export type TeachingDocumentDraftEvent = z.infer<typeof teachingDocumentDraftEventSchema>;

export function teachingDocumentTextDeltaEvent(input: {
  delta: string;
  sequence: number;
  startOffset: number;
}): Extract<TeachingDocumentDraftEvent, { event: "text_delta" }> {
  const event = teachingDocumentDraftEventSchema.parse({
    ...input,
    event: "text_delta",
    kind: "teaching_document",
    version: 3,
  });
  if (event.event !== "text_delta") throw new Error("Teaching document delta invariant failed");
  return event;
}

export function teachingDocumentDraftMarkdown(draft: TeachingDocumentGenerationDraft | null) {
  return draft?.markdown ?? "";
}

export function applyTeachingDocumentDraftEvent(
  current: TeachingDocumentGenerationDraft | null,
  event: TeachingDocumentDraftEvent,
) {
  if (event.event !== "text_delta") return current;
  const markdown = teachingDocumentDraftMarkdown(current);
  if (event.startOffset < markdown.length) {
    const end = event.startOffset + event.delta.length;
    if (markdown.slice(event.startOffset, end) === event.delta) return current;
    throw new Error("teaching_document_stream_overlap");
  }
  if (event.startOffset !== markdown.length) throw new Error("teaching_document_stream_gap");
  return teachingDocumentGenerationDraftSchema.parse({
    format: "markdown",
    markdown: markdown + event.delta,
  });
}
