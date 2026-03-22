import type { ArtifactHistoryItem } from "@/lib/project-space/artifact-history";
import {
  buildCapabilityWithoutArtifact,
  resolveCapabilityFromArtifact,
} from "@/components/project/features/studio/tools/capability-resolver";

function makeArtifact(
  overrides: Partial<ArtifactHistoryItem> = {}
): ArtifactHistoryItem {
  return {
    artifactId: "art_1",
    sessionId: "sess_1",
    toolType: "mindmap",
    artifactType: "mindmap",
    title: "artifact",
    status: "completed",
    createdAt: "2026-03-22T10:00:00.000Z",
    basedOnVersionId: null,
    ...overrides,
  };
}

describe("studio capability resolver", () => {
  it("marks word/summary/handout as backend not implemented", () => {
    expect(buildCapabilityWithoutArtifact("word").status).toBe(
      "backend_not_implemented"
    );
    expect(buildCapabilityWithoutArtifact("summary").status).toBe(
      "backend_not_implemented"
    );
    expect(buildCapabilityWithoutArtifact("handout").status).toBe(
      "backend_not_implemented"
    );
  });

  it("marks mindmap as ready when backend returns non-empty nodes", async () => {
    const artifact = makeArtifact({ artifactType: "mindmap" });
    const blob = new Blob([
      JSON.stringify({ nodes: [{ id: "root", title: "中心主题", children: [] }] }),
    ]);
    const result = await resolveCapabilityFromArtifact({
      toolId: "mindmap",
      artifact,
      blob,
    });

    expect(result.status).toBe("backend_ready");
    expect(result.resolvedArtifact?.contentKind).toBe("json");
  });

  it("marks mindmap as placeholder when nodes is empty", async () => {
    const artifact = makeArtifact({ artifactType: "mindmap" });
    const blob = new Blob([JSON.stringify({ nodes: [] })]);
    const result = await resolveCapabilityFromArtifact({
      toolId: "mindmap",
      artifact,
      blob,
    });

    expect(result.status).toBe("backend_placeholder");
    expect(result.reason).toContain("空 nodes");
  });

  it("marks quiz exercise as ready only when questions is non-empty", async () => {
    const artifact = makeArtifact({ artifactType: "exercise" });

    const ready = await resolveCapabilityFromArtifact({
      toolId: "quiz",
      artifact,
      blob: new Blob([JSON.stringify({ questions: [{ id: "q1", question: "Q" }] })]),
    });
    expect(ready.status).toBe("backend_ready");

    const placeholder = await resolveCapabilityFromArtifact({
      toolId: "quiz",
      artifact,
      blob: new Blob([JSON.stringify({ questions: [] })]),
    });
    expect(placeholder.status).toBe("backend_placeholder");
  });

  it("marks html as placeholder when template is empty", async () => {
    const artifact = makeArtifact({ artifactType: "html" });
    const result = await resolveCapabilityFromArtifact({
      toolId: "outline",
      artifact,
      blob: new Blob(["<html><body>empty</body></html>"]),
    });

    expect(result.status).toBe("backend_placeholder");
  });

  it("marks media as placeholder for tiny files and ready for real files", async () => {
    const artifact = makeArtifact({ artifactType: "gif" });

    const placeholder = await resolveCapabilityFromArtifact({
      toolId: "animation",
      artifact,
      blob: new Blob([new Uint8Array([1, 2, 3])]),
    });
    expect(placeholder.status).toBe("backend_placeholder");

    const ready = await resolveCapabilityFromArtifact({
      toolId: "animation",
      artifact,
      blob: new Blob([new Uint8Array(256)]),
    });
    expect(ready.status).toBe("backend_ready");
    expect(ready.resolvedArtifact?.contentKind).toBe("media");
  });
});
