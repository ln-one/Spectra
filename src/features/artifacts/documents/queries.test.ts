import { afterEach, expect, test, vi } from "vitest";
import {
  fetchTeachingDocumentSuggestions,
  readyTeachingDocumentDetail,
  teachingDocumentHistoryItem,
  upsertTeachingDocumentHistory,
} from "./queries";
import type { TeachingDocumentArtifact } from "./types";

afterEach(() => vi.unstubAllGlobals());

function artifact(overrides: Partial<TeachingDocumentArtifact> = {}): TeachingDocumentArtifact {
  return {
    createdAt: "2026-07-18T01:00:00.000Z",
    currentRevision: {
      artifactId: "00000000-0000-4000-8000-000000000201",
      content: {
        document: { content: [], type: "doc" },
        generation: { outcome: "complete", rawOutput: "", warnings: [] },
        schemaVersion: 2,
        sourceMarkdown: "",
        title: "Document",
      },
      contentSha256: "a".repeat(64),
      createdAt: "2026-07-18T01:00:00.000Z",
      id: "00000000-0000-4000-8000-000000000202",
      parentRevisionId: null,
      revisionNumber: 1,
    },
    id: "00000000-0000-4000-8000-000000000201",
    title: "Document",
    updatedAt: "2026-07-18T01:00:00.000Z",
    workspaceId: "00000000-0000-4000-8000-000000000203",
    ...overrides,
  };
}

test("maps an artifact to compact history metadata", () => {
  expect(teachingDocumentHistoryItem(readyTeachingDocumentDetail(artifact()))).toMatchObject({
    currentRevisionId: "00000000-0000-4000-8000-000000000202",
    kind: "teaching_document",
    title: "Document",
  });
});

test("upserts, deduplicates, and caps history at fifty items", () => {
  const existing = Array.from({ length: 50 }, (_, index) => ({
    createdAt: "2026-07-18T00:00:00.000Z",
    currentRevisionId: `00000000-0000-4000-8000-${String(index + 300).padStart(12, "0")}`,
    generationState: "ready" as const,
    id: `00000000-0000-4000-8000-${String(index + 400).padStart(12, "0")}`,
    kind: "teaching_document" as const,
    title: `Existing ${index}`,
    updatedAt: "2026-07-18T00:00:00.000Z",
  }));
  const existingId = existing[12]?.id;
  if (!existingId) throw new Error("Missing history fixture");
  const updated = artifact({ id: existingId, title: "Updated" });
  const result = upsertTeachingDocumentHistory(existing, readyTeachingDocumentDetail(updated));
  expect(result).toHaveLength(50);
  expect(result[0]).toMatchObject({ id: existingId, title: "Updated" });
  expect(result.filter((item) => item.id === updated.id)).toHaveLength(1);
});

test("requests suggestions in the active interface language", async () => {
  const suggestions = [0, 1, 2, 3].map((index) => ({
    prompt: `Prompt ${index}`,
    title: `Suggestion ${index}`,
  }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ status: "fresh", suggestions })),
  );

  await expect(fetchTeachingDocumentSuggestions("workspace", "en-US")).resolves.toEqual({
    status: "fresh",
    suggestions,
  });
  expect(fetch).toHaveBeenCalledWith(
    "/api/artifacts/suggestions?locale=en-US&target=teaching_document&view=artifact-v1&workspaceId=workspace",
  );
});

test("rejects suggestion responses that do not contain exactly four cards", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        status: "fresh",
        suggestions: [{ prompt: "Prompt", title: "Suggestion" }],
      }),
    ),
  );
  await expect(fetchTeachingDocumentSuggestions("workspace", "en-US")).rejects.toThrow();
});
