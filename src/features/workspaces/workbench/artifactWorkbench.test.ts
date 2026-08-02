import { describe, expect, it } from "vitest";
import {
  artifactDetailRefetchInterval,
  artifactHistoryRefetchInterval,
  artifactKindForSelection,
  artifactSelectionForTool,
  artifactSelectionReducer,
  artifactWorkbenchLayoutMode,
  artifactWorkspacePhase,
  initialArtifactSelectionState,
  isArtifactCreationToolAvailable,
  newestArtifactDetail,
  selectedArtifactIdForState,
  studioToolForArtifactKind,
} from "./artifactWorkbench";

const queuedDetail = {
  artifact: null,
  createdAt: "2026-07-18T00:00:00.000Z",
  draft: null,
  failureCode: null,
  generationState: "queued" as const,
  id: "00000000-0000-4000-8000-000000000001",
  kind: "teaching_document" as const,
  generationAttemptId: null,
  generationSequence: 0,
  title: "Queued",
  updatedAt: "2026-07-18T00:00:00.000Z",
  workspaceId: "00000000-0000-4000-8000-000000000002",
};

describe("artifact workbench contract", () => {
  it("polls quickly until a queued Artifact exposes its durable stream", () => {
    const startedAt = Date.parse(queuedDetail.updatedAt);
    expect(artifactDetailRefetchInterval(queuedDetail, startedAt + 1_000)).toBe(500);
    expect(artifactDetailRefetchInterval(queuedDetail, startedAt + 20_000)).toBe(2_000);
    expect(artifactDetailRefetchInterval(queuedDetail, startedAt + 70_000)).toBe(10_000);
    expect(
      artifactDetailRefetchInterval(
        { ...queuedDetail, generationAttemptId: "00000000-0000-4000-8000-000000000001" },
        startedAt + 1_000,
      ),
    ).toBe(2_000);
    expect(
      artifactDetailRefetchInterval(
        {
          ...queuedDetail,
          failureCode: "teaching_document_provider_failed",
          generationState: "failed",
        },
        startedAt + 1_000,
      ),
    ).toBe(false);
  });
  it("does not let a lagging detail poll replace a newer live draft", () => {
    const cached = {
      ...queuedDetail,
      draft: { format: "markdown" as const, markdown: "abcdef" },
      generationAttemptId: "00000000-0000-4000-8000-000000000003",
      generationSequence: 2,
      generationState: "generating" as const,
      updatedAt: "2026-07-18T00:00:00.000Z",
    };
    const laggingServer = {
      ...cached,
      draft: { format: "markdown" as const, markdown: "abc" },
      generationSequence: 1,
      updatedAt: "2026-07-18T00:00:01.000Z",
    };

    expect(newestArtifactDetail(cached, laggingServer, cached.id)).toBe(cached);
  });
  it("preserves an ephemeral Presentation preview while the server advances to publishing", () => {
    const preview = {
      pageMap: { "pages/cover.page": "pageType: cover\nelements: []" },
      pptdContent: "pages: [pages/cover.page]",
      totalPages: 1,
    };
    const cached = {
      artifact: null,
      createdAt: queuedDetail.createdAt,
      failureCode: null,
      generationAttemptId: "00000000-0000-4000-8000-000000000003",
      generationDraft: { phase: "authoring" as const, preview, schemaVersion: 1 as const },
      generationSequence: 1_001,
      generationState: "generating" as const,
      id: queuedDetail.id,
      kind: "presentation" as const,
      title: "Streaming deck",
      updatedAt: queuedDetail.updatedAt,
      workspaceId: queuedDetail.workspaceId,
    };
    const publishing = {
      ...cached,
      generationDraft: { phase: "publishing" as const, schemaVersion: 1 as const },
      generationSequence: 3,
      generationState: "finalizing" as const,
      updatedAt: "2026-07-18T00:00:01.000Z",
    };

    expect(newestArtifactDetail(cached, publishing, cached.id)).toMatchObject({
      generationDraft: { phase: "publishing", preview },
      generationSequence: 1_001,
      generationState: "finalizing",
    });
  });
  it("preserves replayed Presentation pages when the terminal server fact is failed", () => {
    const preview = {
      pageMap: { "pages/cover.page": "pageType: cover\nelements: []" },
      pptdContent: "size: [1280, 720]\npages: [pages/cover.page]",
      totalPages: 1,
    };
    const cached = {
      artifact: null,
      createdAt: queuedDetail.createdAt,
      failureCode: null,
      generationAttemptId: "00000000-0000-4000-8000-000000000003",
      generationDraft: { phase: "authoring" as const, preview, schemaVersion: 1 as const },
      generationSequence: 1_001,
      generationState: "generating" as const,
      id: queuedDetail.id,
      kind: "presentation" as const,
      title: "Streaming deck",
      updatedAt: queuedDetail.updatedAt,
      workspaceId: queuedDetail.workspaceId,
    };
    const failed = {
      ...cached,
      failureCode: "presentation_remote_error",
      generationDraft: { phase: "failed" as const, schemaVersion: 1 as const },
      generationSequence: 4,
      generationState: "failed" as const,
      updatedAt: "2026-07-18T00:00:01.000Z",
    };

    expect(newestArtifactDetail(cached, failed, cached.id)).toMatchObject({
      failureCode: "presentation_remote_error",
      generationDraft: { phase: "failed", preview },
      generationSequence: 1_001,
      generationState: "failed",
    });
  });
  it("shows a newly saved revision even when its ready detail has no generation sequence", () => {
    const cached = {
      ...queuedDetail,
      artifact: {
        createdAt: queuedDetail.createdAt,
        currentRevision: {
          artifactId: queuedDetail.id,
          content: {
            document: { content: [], type: "doc" as const },
            generation: { outcome: "complete" as const, rawOutput: "", warnings: [] },
            schemaVersion: 2 as const,
            sourceMarkdown: "",
            title: "Before save",
          },
          contentSha256: "a".repeat(64),
          createdAt: queuedDetail.createdAt,
          id: "00000000-0000-4000-8000-000000000011",
          parentRevisionId: null,
          revisionNumber: 1,
        },
        id: queuedDetail.id,
        title: "Before save",
        updatedAt: queuedDetail.updatedAt,
        workspaceId: queuedDetail.workspaceId,
      },
      generationSequence: 8,
      generationState: "ready" as const,
    };
    const saved = {
      ...cached,
      artifact: {
        ...cached.artifact,
        currentRevision: {
          ...cached.artifact.currentRevision,
          id: "00000000-0000-4000-8000-000000000012",
          parentRevisionId: cached.artifact.currentRevision.id,
          revisionNumber: 2,
        },
      },
      generationSequence: 0,
      updatedAt: "2026-07-18T00:00:01.000Z",
    };

    expect(newestArtifactDetail(cached, saved, cached.id)).toBe(saved);
    expect(newestArtifactDetail(saved, cached, cached.id)).toBe(saved);
  });
  it("allows a newer retry attempt to replace the previous failed attempt", () => {
    const failed = {
      ...queuedDetail,
      failureCode: "teaching_document_provider_failed" as const,
      generationAttemptId: "00000000-0000-4000-8000-000000000003",
      generationState: "failed" as const,
      updatedAt: "2026-07-18T00:00:00.000Z",
    };
    const retried = {
      ...queuedDetail,
      generationAttemptId: "00000000-0000-4000-8000-000000000004",
      updatedAt: "2026-07-18T00:00:01.000Z",
    };

    expect(newestArtifactDetail(failed, retried, failed.id)).toBe(retried);
  });
  it("backs off history polling when an unclaimed Artifact stops changing", () => {
    const startedAt = Date.parse(queuedDetail.updatedAt);
    const history = [
      {
        createdAt: queuedDetail.createdAt,
        currentRevisionId: null,
        generationState: queuedDetail.generationState,
        id: queuedDetail.id,
        kind: queuedDetail.kind,
        title: queuedDetail.title,
        updatedAt: queuedDetail.updatedAt,
      },
    ];
    expect(artifactHistoryRefetchInterval(history, startedAt + 1_000)).toBe(1_000);
    expect(artifactHistoryRefetchInterval(history, startedAt + 20_000)).toBe(3_000);
    expect(artifactHistoryRefetchInterval(history, startedAt + 70_000)).toBe(10_000);
    expect(artifactHistoryRefetchInterval(history, startedAt + 6 * 60_000)).toBe(30_000);
    const historyItem = history[0];
    expect(historyItem).toBeDefined();
    if (!historyItem) throw new Error("History fixture is missing");
    expect(
      artifactHistoryRefetchInterval([{ ...historyItem, generationState: "ready" }], startedAt),
    ).toBe(false);
  });
  it("registers presentation creation as a shared Artifact start entry", () => {
    expect(isArtifactCreationToolAvailable("smart-slides")).toBe(true);
    const selection = artifactSelectionForTool("smart-slides");
    expect(selection).toEqual({ mode: "starting", toolId: "smart-slides" });
    expect(selection && artifactKindForSelection(selection)).toBe("presentation");
  });

  it("registers the implemented document and mind map creation entries", () => {
    expect(isArtifactCreationToolAvailable("teaching-document")).toBe(true);
    expect(isArtifactCreationToolAvailable("mind-map")).toBe(true);
    const mindMapSelection = artifactSelectionForTool("mind-map");
    expect(mindMapSelection).toEqual({ mode: "starting", toolId: "mind-map" });
    expect(mindMapSelection && artifactKindForSelection(mindMapSelection)).toBe("mind_map");

    const selection = artifactSelectionForTool("teaching-document");
    expect(selection).toEqual({ mode: "starting", toolId: "teaching-document" });
    expect(selection && artifactKindForSelection(selection)).toBe("teaching_document");
  });

  it("uses URL selection only after local navigation transitions settle", () => {
    const artifactId = "00000000-0000-4000-8000-000000000710";
    const selected = artifactSelectionReducer(initialArtifactSelectionState, {
      artifactId,
      type: "select",
    });
    expect(selectedArtifactIdForState(selected, null)).toBe(artifactId);
    const synchronized = artifactSelectionReducer(selected, {
      artifactId,
      type: "urlChanged",
    });
    expect(synchronized).toEqual(initialArtifactSelectionState);
    expect(selectedArtifactIdForState(synchronized, artifactId)).toBe(artifactId);

    const leaving = artifactSelectionReducer(synchronized, { type: "openStudio" });
    expect(selectedArtifactIdForState(leaving, artifactId)).toBeNull();
    expect(artifactSelectionReducer(leaving, { artifactId: null, type: "urlChanged" })).toEqual(
      initialArtifactSelectionState,
    );
  });

  it("isolates an unavailable Artifact until its URL is removed", () => {
    const artifactId = "00000000-0000-4000-8000-000000000711";
    const unavailable = artifactSelectionReducer(initialArtifactSelectionState, {
      artifactId,
      type: "unavailable",
    });
    expect(selectedArtifactIdForState(unavailable, artifactId)).toBeNull();
    expect(artifactSelectionReducer(unavailable, { artifactId: null, type: "urlChanged" })).toEqual(
      initialArtifactSelectionState,
    );
  });

  it("keeps Artifact presentation independent from creation availability", () => {
    expect(studioToolForArtifactKind("teaching_document")).toBe("teaching-document");
  });

  it("projects durable generation states into shared workspace phases", () => {
    expect(artifactWorkspacePhase(undefined)).toBe("idle");
    expect(artifactWorkspacePhase("queued")).toBe("generating");
    expect(artifactWorkspacePhase("generating")).toBe("generating");
    expect(artifactWorkspacePhase("finalizing")).toBe("finalizing");
    expect(artifactWorkspacePhase("ready")).toBe("ready");
    expect(artifactWorkspacePhase("failed")).toBe("failed");
  });

  it("moves to preview geometry when generation starts, before content is renderable", () => {
    expect(
      artifactWorkbenchLayoutMode({
        generationState: "generating",
        hasRenderableContent: false,
      }),
    ).toBe("preview");
    expect(
      artifactWorkbenchLayoutMode({
        generationState: "queued",
        hasRenderableContent: false,
      }),
    ).toBe("preview");
    expect(
      artifactWorkbenchLayoutMode({
        generationState: "generating",
        hasRenderableContent: true,
      }),
    ).toBe("preview");
    expect(
      artifactWorkbenchLayoutMode({ generationState: "ready", hasRenderableContent: false }),
    ).toBe("preview");
    expect(
      artifactWorkbenchLayoutMode({ generationState: "failed", hasRenderableContent: false }),
    ).toBe("compose");
  });
});
