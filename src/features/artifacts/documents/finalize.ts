import "server-only";

import type { JSONContent } from "@tiptap/core";
import { generateUniqueIds } from "@tiptap/extension-unique-id";
import {
  type TeachingDocumentDraft,
  type TeachingDocumentRevisionContent,
  teachingDocumentBlocksWithoutRepeatedTitle,
  teachingDocumentDraftSchema,
  teachingDocumentDraftToTiptap,
  teachingDocumentRevisionContentSchema,
} from "./contract";
import { createTeachingDocumentEditorExtensions } from "./editor";

function draftMarkdown(draft: TeachingDocumentDraft) {
  const blocks = draft.blocks.map((block) => {
    switch (block.kind) {
      case "heading":
        return `${"#".repeat(block.level)} ${block.text}`;
      case "bullet":
        return `- ${block.text}`;
      case "ordered":
        return `1. ${block.text}`;
      case "quote":
        return `> ${block.text.replaceAll("\n", "\n> ")}`;
      case "code":
        return `\`\`\`${block.language ?? ""}\n${block.text}\n\`\`\``;
      case "paragraph":
        return block.text;
      default: {
        const unreachable: never = block;
        return unreachable;
      }
    }
  });
  return [`# ${draft.title}`, ...blocks].join("\n\n");
}

export function finalizeTeachingDocumentDraft(
  input: TeachingDocumentDraft,
): TeachingDocumentRevisionContent {
  const draft = teachingDocumentDraftSchema.parse(input);
  const normalizedDraft = {
    ...draft,
    blocks: teachingDocumentBlocksWithoutRepeatedTitle(draft),
  };
  const document = generateUniqueIds(
    teachingDocumentDraftToTiptap(normalizedDraft) as JSONContent,
    createTeachingDocumentEditorExtensions(),
  );
  const sourceMarkdown = draftMarkdown(normalizedDraft);
  return teachingDocumentRevisionContentSchema.parse({
    document,
    generation: { outcome: "complete", rawOutput: sourceMarkdown, warnings: [] },
    schemaVersion: 2,
    sourceMarkdown,
    title: draft.title,
  });
}
