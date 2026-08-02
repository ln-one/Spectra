import { describe, expect, test } from "vitest";
import {
  applyTeachingDocumentDraftEvent,
  teachingDocumentDraftEventSchema,
  teachingDocumentDraftMarkdown,
  teachingDocumentTextDeltaEvent,
} from "./realtime";

describe("teaching document text delta stream", () => {
  test("appends every provider delta exactly once without a final replay snapshot", () => {
    const first = teachingDocumentTextDeltaEvent({
      delta: "# Title\n\n",
      sequence: 1,
      startOffset: 0,
    });
    const second = teachingDocumentTextDeltaEvent({
      delta: "Visible **content**",
      sequence: 2,
      startOffset: first.delta.length,
    });
    const firstDraft = applyTeachingDocumentDraftEvent(null, first);
    const secondDraft = applyTeachingDocumentDraftEvent(firstDraft, second);
    expect(teachingDocumentDraftMarkdown(secondDraft)).toBe("# Title\n\nVisible **content**");
    expect(applyTeachingDocumentDraftEvent(secondDraft, second)).toBe(secondDraft);
    expect(
      teachingDocumentDraftEventSchema.safeParse({
        draft: secondDraft,
        event: "snapshot",
        kind: "teaching_document",
        sequence: 3,
        version: 3,
      }).success,
    ).toBe(false);
  });

  test("detects a missing offset so the caller can reload its durable checkpoint", () => {
    expect(() =>
      applyTeachingDocumentDraftEvent(
        { format: "markdown", markdown: "abc" },
        teachingDocumentTextDeltaEvent({ delta: "x", sequence: 2, startOffset: 5 }),
      ),
    ).toThrow("teaching_document_stream_gap");
  });
});
