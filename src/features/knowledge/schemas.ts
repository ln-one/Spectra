import { z } from "zod";

const normalizedBoxSchema = z
  .object({
    left: z.number().min(0).max(1),
    top: z.number().min(0).max(1),
    right: z.number().min(0).max(1),
    bottom: z.number().min(0).max(1),
  })
  .strict()
  .refine((box) => box.right >= box.left && box.bottom >= box.top);

export const evidenceLocatorSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("text_range"),
      start: z.int().nonnegative(),
      end: z.int().positive(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("page_region"),
      pageIndex: z.int().nonnegative(),
      boxes: z.array(normalizedBoxSchema),
      rotation: z.number().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("page_regions"),
      regions: z
        .array(
          z
            .object({
              pageIndex: z.int().nonnegative(),
              boxes: z.array(normalizedBoxSchema),
              rotation: z
                .union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])
                .optional(),
            })
            .strict(),
        )
        .min(1),
      anchor: z.string().trim().min(1).optional(),
    })
    .strict(),
  z
    .object({ kind: z.literal("grid_range"), sheetId: z.string().min(1), range: z.string().min(1) })
    .strict(),
  z
    .object({
      kind: z.literal("structured_path"),
      dialect: z.enum(["json-pointer", "yaml-path", "xml-path", "html-path"]),
      path: z.string(),
      start: z.int().nonnegative().optional(),
      end: z.int().positive().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("cue_range"),
      cueIds: z.array(z.string().min(1)).min(1),
      startMs: z.int().nonnegative(),
      endMs: z.int().positive(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("media_range"),
      startMs: z.int().nonnegative(),
      endMs: z.int().positive(),
      region: normalizedBoxSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("notebook_cell"),
      cellId: z.string().min(1),
      start: z.int().nonnegative(),
      end: z.int().positive(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("code_range"),
      startByte: z.int().nonnegative(),
      endByte: z.int().positive(),
      startLine: z.int().positive(),
      endLine: z.int().positive(),
    })
    .strict(),
]);

export const evidenceContentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("exact_text"), text: z.string().min(1) }).strict(),
  z
    .object({
      kind: z.literal("table_cells"),
      cells: z
        .array(
          z
            .object({
              address: z.string().min(1),
              value: z.string(),
              displayValue: z.string().optional(),
              formula: z.string().min(1).optional(),
              rowSpan: z.int().positive().optional(),
              colSpan: z.int().positive().optional(),
            })
            .strict(),
        )
        .min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("visual_region"),
      accessibleDescription: z.string().min(1).optional(),
      asset: z
        .discriminatedUnion("kind", [
          z.object({ kind: z.literal("source_original") }).strict(),
          z
            .object({ kind: z.literal("ingestion_archive_entry"), path: z.string().min(1) })
            .strict(),
        ])
        .optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("timed_transcript"),
      text: z.string().min(1),
      fidelity: z.enum(["source-caption", "asr", "model-description"]),
    })
    .strict(),
]);

export const evidenceFidelitySchema = z.enum(["source", "ocr", "asr", "model-description"]);
