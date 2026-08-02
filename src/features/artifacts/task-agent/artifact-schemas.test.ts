import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createTaskAgentArtifactSchemas } from "./artifact-schemas";

const contentSchema = z.object({ title: z.string() }).strict();
const draftSchema = z.object({ stage: z.string() }).strict();
const schemas = createTaskAgentArtifactSchemas("animation", contentSchema, draftSchema);

const baseDetail = {
  createdAt: "2026-07-28T00:00:00.000Z",
  failureCode: null,
  generationAttemptId: "10000000-0000-4000-8000-000000000001",
  generationDraft: { stage: "authoring" },
  generationSequence: 1,
  id: "10000000-0000-4000-8000-000000000002",
  kind: "animation",
  title: "Demo",
  updatedAt: "2026-07-28T00:00:00.000Z",
  workspaceId: "10000000-0000-4000-8000-000000000003",
} as const;

describe("createTaskAgentArtifactSchemas", () => {
  it("preserves the discriminated generation lifecycle", () => {
    expect(
      schemas.detailSchema.parse({
        ...baseDetail,
        artifact: null,
        generationState: "generating",
      }),
    ).toMatchObject({ generationDraft: { stage: "authoring" }, generationState: "generating" });

    expect(
      schemas.detailSchema.safeParse({
        ...baseDetail,
        artifact: null,
        failureCode: null,
        generationState: "failed",
      }).success,
    ).toBe(false);
  });

  it("requires ready details to carry a revision and clear the draft", () => {
    const ready = {
      ...baseDetail,
      artifact: {
        createdAt: baseDetail.createdAt,
        currentRevision: {
          artifactId: baseDetail.id,
          content: { title: "Demo" },
          contentSha256: "a".repeat(64),
          createdAt: baseDetail.createdAt,
          id: "10000000-0000-4000-8000-000000000004",
          parentRevisionId: null,
          revisionNumber: 1,
        },
        id: baseDetail.id,
        title: "Demo",
        updatedAt: baseDetail.updatedAt,
        workspaceId: baseDetail.workspaceId,
      },
      generationDraft: null,
      generationState: "ready",
    } as const;

    expect(schemas.detailSchema.parse(ready)).toEqual(ready);
    expect(
      schemas.detailSchema.safeParse({ ...ready, generationDraft: { stage: "authoring" } }).success,
    ).toBe(false);
  });

  it("keeps every persisted level strict", () => {
    expect(
      schemas.detailSchema.safeParse({
        ...baseDetail,
        artifact: null,
        generationState: "queued",
        legacyState: "pending",
      }).success,
    ).toBe(false);
  });
});
