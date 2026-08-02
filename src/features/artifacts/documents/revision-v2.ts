import { z } from "zod";
import { artifactGenerationProvenanceSchema } from "@/features/artifacts/generation";

const nodeIdSchema = z.string().min(1).max(128);

const textMarkSchema = z.union([
  z.object({ type: z.enum(["bold", "italic", "strike", "code"]) }).strict(),
  z
    .object({
      attrs: z.object({ href: z.string().max(8_192) }).strict(),
      type: z.literal("link"),
    })
    .strict(),
]);

export type TeachingDocumentInlineNodeV2 =
  | { type: "hardBreak" }
  | {
      marks?: Array<z.infer<typeof textMarkSchema>> | undefined;
      text: string;
      type: "text";
    };

const inlineNodeSchema: z.ZodType<TeachingDocumentInlineNodeV2> = z.union([
  z.object({ type: z.literal("hardBreak") }).strict(),
  z
    .object({
      marks: z.array(textMarkSchema).optional(),
      text: z.string().min(1),
      type: z.literal("text"),
    })
    .strict(),
]);

const paragraphSchema = z
  .object({
    attrs: z.object({ id: nodeIdSchema }).strict(),
    content: z.array(inlineNodeSchema).optional(),
    type: z.literal("paragraph"),
  })
  .strict();

type TeachingDocumentParagraphV2 = z.infer<typeof paragraphSchema>;
type TeachingDocumentTableCellV2 = {
  attrs: { id: string };
  content: TeachingDocumentParagraphV2[];
  type: "tableCell" | "tableHeader";
};
type TeachingDocumentTableRowV2 = {
  attrs: { id: string };
  content: TeachingDocumentTableCellV2[];
  type: "tableRow";
};
export type TeachingDocumentTableV2 = {
  attrs: { id: string };
  content: TeachingDocumentTableRowV2[];
  type: "table";
};
export type TeachingDocumentBulletListV2 = {
  attrs: { id: string };
  content: TeachingDocumentListItemV2[];
  type: "bulletList";
};
export type TeachingDocumentOrderedListV2 = {
  attrs: { id: string; start: number; type: string | null };
  content: TeachingDocumentListItemV2[];
  type: "orderedList";
};
export type TeachingDocumentListItemV2 = {
  attrs: { id: string };
  content: Array<
    TeachingDocumentParagraphV2 | TeachingDocumentBulletListV2 | TeachingDocumentOrderedListV2
  >;
  type: "listItem";
};

const listItemSchema: z.ZodType<TeachingDocumentListItemV2> = z.lazy(() =>
  z
    .object({
      attrs: z.object({ id: nodeIdSchema }).strict(),
      content: z.array(z.union([paragraphSchema, bulletListSchema, orderedListSchema])).min(1),
      type: z.literal("listItem"),
    })
    .strict(),
);

const bulletListSchema: z.ZodType<TeachingDocumentBulletListV2> = z.lazy(() =>
  z
    .object({
      attrs: z.object({ id: nodeIdSchema }).strict(),
      content: z.array(listItemSchema).min(1),
      type: z.literal("bulletList"),
    })
    .strict(),
);

const orderedListSchema: z.ZodType<TeachingDocumentOrderedListV2> = z.lazy(() =>
  z
    .object({
      attrs: z
        .object({ id: nodeIdSchema, start: z.number().int().min(1), type: z.string().nullable() })
        .strict(),
      content: z.array(listItemSchema).min(1),
      type: z.literal("orderedList"),
    })
    .strict(),
);

const headingSchema = z
  .object({
    attrs: z.object({ id: nodeIdSchema, level: z.number().int().min(1).max(3) }).strict(),
    content: z.array(inlineNodeSchema).optional(),
    type: z.literal("heading"),
  })
  .strict();

const blockquoteSchema = z
  .object({
    attrs: z.object({ id: nodeIdSchema }).strict(),
    content: z.array(paragraphSchema).min(1),
    type: z.literal("blockquote"),
  })
  .strict();

const codeBlockSchema = z
  .object({
    attrs: z.object({ id: nodeIdSchema, language: z.string().nullable() }).strict(),
    content: z.array(inlineNodeSchema).optional(),
    type: z.literal("codeBlock"),
  })
  .strict();

const horizontalRuleSchema = z
  .object({
    attrs: z.object({ id: nodeIdSchema }).strict(),
    type: z.literal("horizontalRule"),
  })
  .strict();

const tableCellSchema: z.ZodType<TeachingDocumentTableCellV2> = z
  .object({
    attrs: z.object({ id: nodeIdSchema }).strict(),
    content: z.array(paragraphSchema).min(1),
    type: z.enum(["tableCell", "tableHeader"]),
  })
  .strict();

const tableRowSchema: z.ZodType<TeachingDocumentTableRowV2> = z
  .object({
    attrs: z.object({ id: nodeIdSchema }).strict(),
    content: z.array(tableCellSchema).min(1),
    type: z.literal("tableRow"),
  })
  .strict();

const tableSchema: z.ZodType<TeachingDocumentTableV2> = z
  .object({
    attrs: z.object({ id: nodeIdSchema }).strict(),
    content: z.array(tableRowSchema).min(1),
    type: z.literal("table"),
  })
  .strict();

export const teachingDocumentRevisionContentV2Schema = z
  .object({
    document: z
      .object({
        content: z
          .array(
            z.union([
              headingSchema,
              paragraphSchema,
              bulletListSchema,
              orderedListSchema,
              blockquoteSchema,
              codeBlockSchema,
              horizontalRuleSchema,
              tableSchema,
            ]),
          )
          .min(1),
        type: z.literal("doc"),
      })
      .strict(),
    generation: artifactGenerationProvenanceSchema,
    schemaVersion: z.literal(2),
    sourceMarkdown: z.string(),
    title: z.string().trim().min(1).max(200),
  })
  .strict();

export type TeachingDocumentRevisionContentV2 = z.infer<
  typeof teachingDocumentRevisionContentV2Schema
>;
