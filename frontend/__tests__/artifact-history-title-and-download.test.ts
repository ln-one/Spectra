import {
  toArtifactHistoryItem,
  type ArtifactHistoryItem,
} from "@/lib/project-space/artifact-history";
import {
  buildArtifactDownloadFilename,
  resolveArtifactTitleFromMetadata,
} from "@/lib/project-space/download-filename";

describe("artifact history and download filename", () => {
  it("prefers metadata.title over run_title for display title", () => {
    const item = toArtifactHistoryItem({
      id: "a-001",
      project_id: "p-001",
      session_id: "s-001",
      based_on_version_id: null,
      owner_user_id: "u-001",
      type: "pptx",
      visibility: "project-visible",
      storage_path: "uploads/a-001.pptx",
      metadata: {
        title: "函数单调性课件",
        run_title: "PPT Ready",
      },
      created_at: "2026-04-01T10:00:00.000Z",
      updated_at: "2026-04-01T10:01:00.000Z",
    } as any);

    expect(item.title).toBe("函数单调性课件");
  });

  it("maps source_artifact_id from metadata into history item", () => {
    const item = toArtifactHistoryItem({
      id: "a-002",
      project_id: "p-001",
      session_id: "s-001",
      based_on_version_id: null,
      owner_user_id: "u-001",
      type: "docx",
      visibility: "project-visible",
      storage_path: "uploads/a-002.docx",
      metadata: {
        title: "函数单调性教案",
        source_artifact_id: "a-ppt-001",
      },
      created_at: "2026-04-01T10:00:00.000Z",
      updated_at: "2026-04-01T10:01:00.000Z",
    } as any);

    expect((item as ArtifactHistoryItem).sourceArtifactId).toBe("a-ppt-001");
  });

  it("builds filename from artifact title and extension", () => {
    const filename = buildArtifactDownloadFilename({
      title: "函数单调性教案",
      artifactId: "a-002",
      artifactType: "docx",
    });
    expect(filename).toBe("函数单调性教案.docx");
  });

  it("falls back to artifact id when title is empty", () => {
    const filename = buildArtifactDownloadFilename({
      title: "  ",
      artifactId: "artifact-12345678",
      artifactType: "pptx",
    });
    expect(filename).toBe("artifact-artifact.pptx");
  });

  it("resolves title from metadata title/name", () => {
    expect(resolveArtifactTitleFromMetadata({ title: "课件A" })).toBe("课件A");
    expect(resolveArtifactTitleFromMetadata({ name: "课件B" })).toBe("课件B");
    expect(resolveArtifactTitleFromMetadata({})).toBeNull();
  });
});

