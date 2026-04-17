import {
  resolveActivePreviewRunId,
  shouldAdoptStudioArtifactForPptPreview,
} from "@/app/projects/[id]/generate/_views/useGeneratePreviewState";

describe("resolveActivePreviewRunId", () => {
  it("returns null when URL run id is missing", () => {
    expect(
      resolveActivePreviewRunId({
        activeSessionId: "session-b",
        runIdFromQuery: null,
        storeActiveSessionId: "session-a",
        storeActiveRunId: "run-a",
        generationSession: {
          session: { session_id: "session-a" },
        },
      })
    ).toBeNull();
  });

  it("does not auto-adopt store run ids without URL run", () => {
    expect(
      resolveActivePreviewRunId({
        activeSessionId: "session-a",
        runIdFromQuery: null,
        storeActiveSessionId: "session-a",
        storeActiveRunId: "run-a",
        generationSession: null,
      })
    ).toBeNull();
  });

  it("prefers the explicit query run id", () => {
    expect(
      resolveActivePreviewRunId({
        activeSessionId: "session-b",
        runIdFromQuery: "run-from-url",
        storeActiveSessionId: "session-a",
        storeActiveRunId: "run-a",
        generationSession: null,
      })
    ).toBe("run-from-url");
  });
});

describe("shouldAdoptStudioArtifactForPptPreview", () => {
  it("accepts courseware_ppt card events", () => {
    expect(
      shouldAdoptStudioArtifactForPptPreview({
        card_id: "courseware_ppt",
        artifact_type: "gif",
      })
    ).toBe(true);
  });

  it("accepts pptx artifact events", () => {
    expect(
      shouldAdoptStudioArtifactForPptPreview({
        card_id: "demonstration_animations",
        artifact_type: "pptx",
      })
    ).toBe(true);
  });

  it("ignores non-ppt studio events", () => {
    expect(
      shouldAdoptStudioArtifactForPptPreview({
        card_id: "demonstration_animations",
        artifact_type: "gif",
      })
    ).toBe(false);
  });
});
