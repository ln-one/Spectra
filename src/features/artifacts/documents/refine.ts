import { z } from "zod";
import type { TeachingDocumentRevisionContent } from "./contract";
import { teachingDocumentEditorJsonToMarkdown } from "./markdown";
import { projectTeachingDocument } from "./projector";
import {
  type TeachingDocumentRevisionContentV2,
  teachingDocumentRevisionContentV2Schema,
} from "./revision-v2";

const blockIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .describe(
    "The exact block ID value inside [block:<id>]. Pass only <id>; never include the [block:] wrapper or block: prefix.",
  );
const markdownFragmentSchema = z.string().trim().min(1).max(100_000);

export const teachingDocumentFocusSchema = z
  .object({
    blockIds: z.array(blockIdSchema).min(1).max(20),
    kind: z.literal("teaching_document_blocks"),
    revisionId: z.string().uuid(),
    selectedText: z.string().trim().min(1).max(20_000),
  })
  .strict()
  .superRefine((focus, context) => {
    if (new Set(focus.blockIds).size !== focus.blockIds.length) {
      context.addIssue({ code: "custom", message: "Focused block IDs must be unique" });
    }
  });

export type TeachingDocumentFocus = z.infer<typeof teachingDocumentFocusSchema>;

const teachingDocumentRefineEditSchema = z.discriminatedUnion("operation", [
  z
    .object({
      blockId: blockIdSchema,
      operation: z.literal("replace_block"),
      replacementMarkdown: markdownFragmentSchema,
    })
    .strict(),
  z
    .object({
      blockId: blockIdSchema,
      markdown: markdownFragmentSchema,
      operation: z.literal("insert_after"),
    })
    .strict(),
  z.object({ blockId: blockIdSchema, operation: z.literal("delete_block") }).strict(),
  z
    .object({
      operation: z.literal("update_title"),
      title: z.string().trim().min(1).max(200),
    })
    .strict(),
]);

export const teachingDocumentRefineEditsSchema = z
  .array(teachingDocumentRefineEditSchema)
  .min(1)
  .max(20)
  .superRefine((edits, context) => {
    const targeted = new Set<string>();
    let titleUpdates = 0;
    for (const [index, edit] of edits.entries()) {
      if (edit.operation === "update_title") {
        titleUpdates += 1;
        if (titleUpdates > 1) {
          context.addIssue({
            code: "custom",
            message: "Only one title update is allowed",
            path: [index],
          });
        }
        continue;
      }
      if (targeted.has(edit.blockId)) {
        context.addIssue({
          code: "custom",
          message: "A block can be edited only once per proposal",
          path: [index, "blockId"],
        });
      }
      targeted.add(edit.blockId);
    }
  });

export type TeachingDocumentRefineEdit = z.infer<typeof teachingDocumentRefineEditSchema>;

export type TeachingDocumentProposalScopeReview =
  | { status: "allowed" }
  | { allowedBlockIds: string[]; status: "outside_scope" };

export function reviewTeachingDocumentProposalScope(
  focus: TeachingDocumentFocus | null | undefined,
  edits: readonly TeachingDocumentRefineEdit[],
): TeachingDocumentProposalScopeReview {
  if (!focus) return { status: "allowed" };
  const allowedBlockIds = [...focus.blockIds];
  const allowed = new Set(allowedBlockIds);
  const isAllowed = edits.every(
    (edit) => edit.operation !== "update_title" && allowed.has(edit.blockId),
  );
  return isAllowed ? { status: "allowed" } : { allowedBlockIds, status: "outside_scope" };
}

type DocumentBlock = TeachingDocumentRevisionContentV2["document"]["content"][number];

export type TeachingDocumentRefineChange = {
  after: DocumentBlock[];
  before: DocumentBlock | null;
  blockId: string | null;
  operation: TeachingDocumentRefineEdit["operation"];
};

function canonicalRevision(input: TeachingDocumentRevisionContent) {
  return teachingDocumentRevisionContentV2Schema.parse(input);
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function plainText(value: unknown): string {
  const node = record(value);
  if (!node) return "";
  const ownText = typeof node.text === "string" ? node.text : "";
  const content = Array.isArray(node.content) ? node.content : [];
  return `${ownText}${content.map(plainText).join("")}`;
}

function normalizedText(value: string) {
  // ProseMirror inserts block separators when a selection crosses list items or table cells,
  // while the persisted JSON stores those boundaries as nested nodes. Ignore whitespace here so
  // the same selected text validates across both representations; block IDs remain the scope.
  return value.normalize("NFKC").replace(/\s+/g, "");
}

function teachingDocumentTopLevelBlocks(
  input: TeachingDocumentRevisionContent,
): Array<{ id: string; text: string; type: string }> {
  return input.document.content.map((block) => ({
    id: block.attrs.id,
    text: plainText(block),
    type: block.type,
  }));
}

export function validateTeachingDocumentFocus(
  input: TeachingDocumentRevisionContent,
  focus: TeachingDocumentFocus,
) {
  const parsed = teachingDocumentFocusSchema.parse(focus);
  const byId = new Map(teachingDocumentTopLevelBlocks(input).map((block) => [block.id, block]));
  const blocks = parsed.blockIds.map((id) => byId.get(id));
  if (blocks.some((block) => !block)) return null;
  const selected = normalizedText(parsed.selectedText);
  const available = normalizedText(blocks.map((block) => block?.text ?? "").join(" "));
  if (!selected || !available.includes(selected)) return null;
  return parsed;
}

function collectNodeIds(value: unknown, ids: Set<string>) {
  if (Array.isArray(value)) {
    for (const child of value) collectNodeIds(child, ids);
    return;
  }
  const node = record(value);
  if (!node) return;
  const attrs = record(node.attrs);
  if (typeof attrs?.id === "string") ids.add(attrs.id);
  if (Array.isArray(node.content)) collectNodeIds(node.content, ids);
}

function reserveNodeId(candidate: string, reservedIds: Set<string>) {
  if (!reservedIds.has(candidate)) {
    reservedIds.add(candidate);
    return candidate;
  }
  for (let sequence = 2; ; sequence += 1) {
    const suffix = `-${sequence}`;
    const next = `${candidate.slice(0, 128 - suffix.length)}${suffix}`;
    if (reservedIds.has(next)) continue;
    reservedIds.add(next);
    return next;
  }
}

function remapNodeIds(
  value: unknown,
  seed: string,
  reservedIds: Set<string>,
  path: number[] = [],
): unknown {
  if (Array.isArray(value)) {
    return value.map((child, index) => remapNodeIds(child, seed, reservedIds, [...path, index]));
  }
  const node = record(value);
  if (!node) return value;
  const attrs = record(node.attrs);
  return {
    ...node,
    ...(attrs
      ? {
          attrs: {
            ...attrs,
            ...(typeof attrs.id === "string"
              ? {
                  id: reserveNodeId(
                    `refine-${seed}-${path.join("-") || "0"}`.slice(0, 128),
                    reservedIds,
                  ),
                }
              : {}),
          },
        }
      : {}),
    ...(Array.isArray(node.content)
      ? { content: remapNodeIds(node.content, seed, reservedIds, [...path, 0]) }
      : {}),
  };
}

function fragmentBlocks(
  markdown: string,
  title: string,
  seed: string,
  reservedIds: Set<string>,
): DocumentBlock[] {
  const revision = projectTeachingDocument({
    outcome: "complete",
    rawOutput: markdown,
    requestedTitle: title,
  }).revision;
  return teachingDocumentRevisionContentV2Schema.parse({
    ...revision,
    document: {
      ...revision.document,
      content: remapNodeIds(revision.document.content, seed, reservedIds),
    },
  }).document.content;
}

export function applyTeachingDocumentRefineEdits(
  input: TeachingDocumentRevisionContent,
  rawEdits: readonly TeachingDocumentRefineEdit[],
): { changes: TeachingDocumentRefineChange[]; content: TeachingDocumentRevisionContentV2 } {
  const base = canonicalRevision(input);
  const edits = teachingDocumentRefineEditsSchema.parse(rawEdits);
  const indexById = new Map(base.document.content.map((block, index) => [block.attrs.id, index]));
  const editById = new Map<string, { edit: TeachingDocumentRefineEdit; index: number }>();
  const reservedIds = new Set<string>();
  collectNodeIds(base.document, reservedIds);
  let nextTitle = base.title;

  for (const [index, edit] of edits.entries()) {
    if (edit.operation === "update_title") {
      nextTitle = edit.title;
      continue;
    }
    if (!indexById.has(edit.blockId)) throw new Error("teaching_document_refine_block_not_found");
    editById.set(edit.blockId, { edit, index });
  }

  const nextBlocks: DocumentBlock[] = [];
  const changes: TeachingDocumentRefineChange[] = [];
  for (const block of base.document.content) {
    const entry = editById.get(block.attrs.id);
    if (!entry) {
      nextBlocks.push(block);
      continue;
    }
    const { edit, index } = entry;
    if (edit.operation === "delete_block") {
      changes.push({
        after: [],
        before: block,
        blockId: block.attrs.id,
        operation: edit.operation,
      });
      continue;
    }
    if (edit.operation === "replace_block") {
      const after = fragmentBlocks(
        edit.replacementMarkdown,
        nextTitle,
        `${index}-replace`,
        reservedIds,
      );
      nextBlocks.push(...after);
      changes.push({ after, before: block, blockId: block.attrs.id, operation: edit.operation });
      continue;
    }
    if (edit.operation !== "insert_after") continue;
    nextBlocks.push(block);
    const after = fragmentBlocks(edit.markdown, nextTitle, `${index}-insert`, reservedIds);
    nextBlocks.push(...after);
    changes.push({ after, before: null, blockId: block.attrs.id, operation: edit.operation });
  }
  if (nextBlocks.length === 0) throw new Error("teaching_document_refine_empty_document");
  if (nextTitle !== base.title) {
    changes.unshift({ after: [], before: null, blockId: null, operation: "update_title" });
  }

  const document = { content: nextBlocks, type: "doc" as const };
  const sourceMarkdown = teachingDocumentEditorJsonToMarkdown(document, nextTitle);
  const content = teachingDocumentRevisionContentV2Schema.parse({
    ...base,
    document,
    generation: { ...base.generation, rawOutput: sourceMarkdown },
    sourceMarkdown,
    title: nextTitle,
  });
  return { changes, content };
}

export function teachingDocumentMarkdownPageWithBlockIds(
  input: TeachingDocumentRevisionContent,
  cursor = 0,
  characterLimit = 12_000,
) {
  const blocks = canonicalRevision(input).document.content;
  const normalizedCursor = Math.min(Math.max(0, Math.trunc(cursor)), blocks.length);
  const selected: string[] = [];
  let size = 0;
  let index = normalizedCursor;
  while (index < blocks.length) {
    const block = blocks[index];
    if (!block) break;
    const singleDocument = { content: [block], type: "doc" as const };
    const markdown = teachingDocumentEditorJsonToMarkdown(singleDocument, "")
      .replace(/^# Untitled document\s*/, "")
      .trim();
    const rendered = `[block:${block.attrs.id}]\n${markdown}`;
    if (selected.length > 0 && size + rendered.length + 2 > characterLimit) break;
    selected.push(rendered);
    size += rendered.length + (selected.length > 1 ? 2 : 0);
    index += 1;
  }
  return { markdown: selected.join("\n\n"), nextCursor: index < blocks.length ? index : null };
}
