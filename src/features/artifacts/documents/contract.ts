import { z } from "zod";
import { artifactGroundingBundleSchema } from "../grounding";
import { teachingDocumentRevisionContentV2Schema } from "./revision-v2";

export const teachingDocumentGenerationRequestSchema = z
  .object({
    grounding: artifactGroundingBundleSchema.optional().default({ evidence: [], version: 1 }),
    locale: z.enum(["zh-CN", "en-US"]),
    prompt: z.string().trim().min(1).max(20_000),
  })
  .strict();

export type TeachingDocumentGenerationRequest = z.infer<
  typeof teachingDocumentGenerationRequestSchema
>;

const documentTextSchema = z.string().trim().min(1).max(200_000);

const teachingDocumentBlockSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("heading"),
      level: z.number().int().min(1).max(3),
      text: documentTextSchema,
    })
    .strict(),
  z.object({ kind: z.literal("paragraph"), text: documentTextSchema }).strict(),
  z.object({ kind: z.literal("bullet"), text: documentTextSchema }).strict(),
  z.object({ kind: z.literal("ordered"), text: documentTextSchema }).strict(),
  z.object({ kind: z.literal("quote"), text: documentTextSchema }).strict(),
  z
    .object({
      kind: z.literal("code"),
      language: z.string().trim().max(32).optional(),
      text: documentTextSchema,
    })
    .strict(),
]);

export const teachingDocumentDraftSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    blocks: z.array(teachingDocumentBlockSchema).min(1),
  })
  .strict();

export type TeachingDocumentDraft = z.infer<typeof teachingDocumentDraftSchema>;

export const teachingDocumentGenerationDraftSchema = z
  .object({
    format: z.literal("markdown"),
    markdown: z.string(),
  })
  .strict();

export type TeachingDocumentGenerationDraft = z.infer<typeof teachingDocumentGenerationDraftSchema>;

function normalizedDocumentLabel(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function teachingDocumentBlocksWithoutRepeatedTitle<
  Block extends { kind: string; text: string },
>(input: { blocks: Block[]; title?: string | undefined }) {
  const [firstBlock, ...remainingBlocks] = input.blocks;
  if (
    firstBlock?.kind === "heading" &&
    input.title &&
    normalizedDocumentLabel(firstBlock.text) === normalizedDocumentLabel(input.title)
  ) {
    return remainingBlocks;
  }
  return input.blocks;
}

export const teachingDocumentRevisionContentSchema = teachingDocumentRevisionContentV2Schema;

export type TeachingDocumentRevisionContent = z.infer<typeof teachingDocumentRevisionContentSchema>;

export const teachingDocumentSuggestionSchema = z
  .object({
    prompt: z.string().trim().min(1).max(600),
    title: z.string().trim().min(1).max(80),
  })
  .strict();

type DraftNode =
  | {
      type: "heading";
      attrs?: { id: string; level: number };
      content: Array<{ type: "text"; text: string }>;
    }
  | { type: "paragraph"; attrs?: { id: string }; content: Array<{ type: "text"; text: string }> }
  | {
      type: "bulletList";
      attrs?: { id: string };
      content: Array<{
        type: "listItem";
        attrs?: { id: string };
        content: Array<{
          type: "paragraph";
          attrs?: { id: string };
          content: Array<{ type: "text"; text: string }>;
        }>;
      }>;
    }
  | {
      type: "orderedList";
      attrs?: { id: string; start: number; type: null };
      content: Array<{
        type: "listItem";
        attrs?: { id: string };
        content: Array<{
          type: "paragraph";
          attrs?: { id: string };
          content: Array<{ type: "text"; text: string }>;
        }>;
      }>;
    }
  | {
      type: "blockquote";
      attrs?: { id: string };
      content: Array<{
        type: "paragraph";
        attrs?: { id: string };
        content: Array<{ type: "text"; text: string }>;
      }>;
    }
  | {
      type: "codeBlock";
      attrs?: { id: string; language: string | null };
      content: Array<{ type: "text"; text: string }>;
    };

export function teachingDocumentDraftToTiptap(
  draft: TeachingDocumentDraft,
  idForPath?: (path: string) => string,
) {
  const content: DraftNode[] = [];
  let activeList: Extract<DraftNode, { type: "bulletList" | "orderedList" }> | null = null;
  for (const [index, block] of draft.blocks.entries()) {
    if (block.kind === "bullet" || block.kind === "ordered") {
      const listType = block.kind === "bullet" ? "bulletList" : "orderedList";
      if (!activeList || activeList.type !== listType) {
        activeList =
          listType === "bulletList"
            ? {
                ...(idForPath ? { attrs: { id: idForPath(`bullet-list-${index}`) } } : {}),
                content: [],
                type: "bulletList",
              }
            : {
                ...(idForPath
                  ? { attrs: { id: idForPath(`ordered-list-${index}`), start: 1, type: null } }
                  : {}),
                content: [],
                type: "orderedList",
              };
        content.push(activeList);
      }
      activeList.content.push({
        ...(idForPath ? { attrs: { id: idForPath(`list-item-${index}`) } } : {}),
        content: [
          {
            ...(idForPath ? { attrs: { id: idForPath(`list-paragraph-${index}`) } } : {}),
            content: [{ text: block.text, type: "text" }],
            type: "paragraph",
          },
        ],
        type: "listItem",
      });
      continue;
    }

    activeList = null;
    if (block.kind === "heading") {
      content.push({
        ...(idForPath ? { attrs: { id: idForPath(`heading-${index}`), level: block.level } } : {}),
        content: [{ text: block.text, type: "text" }],
        type: "heading",
      });
      continue;
    }
    if (block.kind === "quote") {
      content.push({
        ...(idForPath ? { attrs: { id: idForPath(`blockquote-${index}`) } } : {}),
        content: [
          {
            ...(idForPath ? { attrs: { id: idForPath(`quote-paragraph-${index}`) } } : {}),
            content: [{ text: block.text, type: "text" }],
            type: "paragraph",
          },
        ],
        type: "blockquote",
      });
      continue;
    }
    if (block.kind === "code") {
      content.push({
        ...(idForPath
          ? { attrs: { id: idForPath(`code-block-${index}`), language: block.language ?? null } }
          : {}),
        content: [{ text: block.text, type: "text" }],
        type: "codeBlock",
      });
      continue;
    }
    content.push({
      ...(idForPath ? { attrs: { id: idForPath(`paragraph-${index}`) } } : {}),
      content: [{ text: block.text, type: "text" }],
      type: "paragraph",
    });
  }
  return { content, type: "doc" as const };
}
