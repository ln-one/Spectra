import { execa } from "execa";
import { expect, test, vi } from "vitest";
import { teachingDocumentToDocx } from "./export";
import { finalizeTeachingDocumentDraft } from "./finalize";

vi.mock("execa", () => ({ execa: vi.fn() }));

const content = finalizeTeachingDocumentDraft({
  blocks: [{ kind: "paragraph", text: "Private lesson text" }],
  title: "Lesson",
});

test("reports an unavailable converter without exposing process diagnostics", async () => {
  vi.mocked(execa).mockRejectedValueOnce(
    Object.assign(new Error("Private lesson text"), { code: "ENOENT" }),
  );
  await expect(teachingDocumentToDocx(content)).rejects.toThrow("pandoc_unavailable");
});

test("redacts failed conversion diagnostics that contain document text", async () => {
  vi.mocked(execa).mockRejectedValueOnce(new Error("Private lesson text"));
  await expect(teachingDocumentToDocx(content)).rejects.toThrow("teaching_document_export_failed");
});
