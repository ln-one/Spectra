import { getSchema } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import type { TeachingDocumentRevisionContent } from "@/features/artifacts/documents/contract";
import {
  createWorkbenchTeachingDocumentExtensions,
  toTeachingDocumentEditorContent,
} from "./teaching-document-editor-extensions";

const labels = {
  before: "before",
  insert: "insert",
  pendingDelete: "pending delete",
  pendingInsert: "pending insert",
  pendingReplace: "pending replace",
  replace: "replace",
};

describe("toTeachingDocumentEditorContent", () => {
  it("deduplicates repeated mark types before strict Tiptap validation", () => {
    const title = "Neural networks";
    const revision = {
      document: {
        content: [
          {
            attrs: { id: "paragraph-1" },
            content: [
              {
                marks: [{ type: "bold" }, { type: "bold" }],
                text: "Weights",
                type: "text",
              },
            ],
            type: "paragraph",
          },
        ],
        type: "doc",
      },
      generation: { outcome: "complete", rawOutput: "**Weights**", warnings: [] },
      schemaVersion: 2,
      sourceMarkdown: "**Weights**",
      title,
    } satisfies TeachingDocumentRevisionContent;

    const content = toTeachingDocumentEditorContent(revision, title);
    const schema = getSchema(createWorkbenchTeachingDocumentExtensions(labels));

    expect(content.content?.[0]?.content?.[0]?.marks).toEqual([{ type: "bold" }]);
    expect(() => schema.nodeFromJSON(content).check()).not.toThrow();
  });
});
