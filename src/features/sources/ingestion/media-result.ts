import { z } from "zod";
import {
  SOURCE_VIDEO_EXTENSIONS,
  type SourceAudioExtension,
  type SourceVideoExtension,
} from "../validation";
import type { MediaUnderstandingResult } from "./media-understanding";

const sourceMediaAnalysisSchema = z.object({
  schemaVersion: z.literal(1),
  summary: z.string().trim().min(1),
  segments: z
    .array(
      z
        .object({
          startMs: z.number().int().nonnegative(),
          endMs: z.number().int().positive(),
          description: z.string().trim().min(1),
        })
        .strict()
        .refine((segment) => segment.endMs > segment.startMs),
    )
    .min(1),
  usage: z
    .object({
      promptTokens: z.number().int().nonnegative().optional(),
      completionTokens: z.number().int().nonnegative().optional(),
    })
    .strict(),
});

export const sourceAudioAnalysisSchema = sourceMediaAnalysisSchema
  .extend({
    kind: z.literal("audio"),
    format: z.enum(["wav", "mp3", "aac"]),
  })
  .strict();

export const sourceVideoAnalysisSchema = sourceMediaAnalysisSchema
  .extend({
    kind: z.literal("video"),
    format: z.enum(SOURCE_VIDEO_EXTENSIONS),
  })
  .strict();

export type SourceAudioAnalysis = z.infer<typeof sourceAudioAnalysisSchema>;
export type SourceVideoAnalysis = z.infer<typeof sourceVideoAnalysisSchema>;

export function sourceAudioAnalysis(
  format: SourceAudioExtension,
  result: MediaUnderstandingResult,
): SourceAudioAnalysis {
  return sourceAudioAnalysisSchema.parse({
    schemaVersion: 1,
    kind: "audio",
    format,
    ...result,
  });
}

export function sourceVideoAnalysis(
  format: SourceVideoExtension,
  result: MediaUnderstandingResult,
): SourceVideoAnalysis {
  return sourceVideoAnalysisSchema.parse({
    schemaVersion: 1,
    kind: "video",
    format,
    ...result,
  });
}
