import {
  buildArtifactDownloadUrl,
  patchLatestQueueItem,
  resolvePreviewMode,
  supportsImagePatchFromEnv,
  type EditQueueItem,
} from "@/lib/project/preview-workbench";

describe("preview workbench helpers", () => {
  it("resolves artifact mode before text fallback", () => {
    expect(
      resolvePreviewMode({
        isLoading: false,
        hasArtifact: true,
        hasSlides: true,
        blockedReason: null,
      })
    ).toBe("artifact_ready");
  });

  it("resolves blocked mode when no artifact and blocked reason exists", () => {
    expect(
      resolvePreviewMode({
        isLoading: false,
        hasArtifact: false,
        hasSlides: false,
        blockedReason: "run not ready",
      })
    ).toBe("blocked");
  });

  it("builds encoded artifact download url", () => {
    expect(buildArtifactDownloadUrl("proj a", "art/1")).toBe(
      "/api/v1/projects/proj%20a/artifacts/art%2F1/download"
    );
  });

  it("gates image patch by env flag", () => {
    expect(supportsImagePatchFromEnv("false")).toBe(false);
    expect(supportsImagePatchFromEnv("true")).toBe(true);
  });

  it("patches the latest matching queue item by slide id", () => {
    const queue: EditQueueItem[] = [
      {
        id: "q1",
        slideId: "s-1",
        slideIndex: 0,
        instruction: "first",
        status: "processing",
        message: "old",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "q2",
        slideId: "s-1",
        slideIndex: 0,
        instruction: "second",
        status: "submitted",
        message: "old",
        createdAt: "2026-01-01T00:01:00.000Z",
        updatedAt: "2026-01-01T00:01:00.000Z",
      },
    ];

    const next = patchLatestQueueItem(
      queue,
      { slideId: "s-1" },
      { status: "success", message: "updated" }
    );
    expect(next[0].status).toBe("processing");
    expect(next[1].status).toBe("success");
    expect(next[1].message).toBe("updated");
  });
});
