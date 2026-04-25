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

  it("preserves artifact metadata snapshots for formal studio resolution", () => {
    const item = toArtifactHistoryItem({
      id: "a-003",
      project_id: "p-001",
      session_id: "s-001",
      based_on_version_id: null,
      owner_user_id: "u-001",
      type: "docx",
      visibility: "project-visible",
      storage_path: "uploads/a-003.docx",
      metadata: {
        title: "牛顿第一定律教案",
        content_snapshot: {
          kind: "word_document",
          document_content: { type: "doc", content: [] },
        },
      },
      created_at: "2026-04-01T10:00:00.000Z",
      updated_at: "2026-04-01T10:01:00.000Z",
    } as any);

    expect(item.metadata).toEqual({
      title: "牛顿第一定律教案",
      content_snapshot: {
        kind: "word_document",
        document_content: { type: "doc", content: [] },
      },
    });
  });

  it("uses content_snapshot title for word history when metadata title is missing", () => {
    const item = toArtifactHistoryItem({
      id: "a-004",
      project_id: "p-001",
      session_id: "s-001",
      based_on_version_id: null,
      owner_user_id: "u-001",
      type: "docx",
      visibility: "project-visible",
      storage_path: "uploads/a-004.docx",
      metadata: {
        content_snapshot: {
          kind: "teaching_document",
          title: "电磁感应教案",
        },
      },
      created_at: "2026-04-01T10:00:00.000Z",
      updated_at: "2026-04-01T10:01:00.000Z",
    } as any);

    expect(item.title).toBe("电磁感应教案");
  });

  it("derives word history title from content_snapshot topic", () => {
    const item = toArtifactHistoryItem({
      id: "a-005",
      project_id: "p-001",
      session_id: "s-001",
      based_on_version_id: null,
      owner_user_id: "u-001",
      type: "docx",
      visibility: "project-visible",
      storage_path: "uploads/a-005.docx",
      metadata: {
        content_snapshot: {
          kind: "teaching_document",
          topic: "牛顿第二定律",
        },
      },
      created_at: "2026-04-01T10:00:00.000Z",
      updated_at: "2026-04-01T10:01:00.000Z",
    } as any);

    expect(item.title).toBe("牛顿第二定律 教案");
  });

  it("uses content_snapshot title for mindmap history when metadata title is preview garbage", () => {
    const item = toArtifactHistoryItem({
      id: "a-005-mindmap",
      project_id: "p-001",
      session_id: "s-001",
      based_on_version_id: null,
      owner_user_id: "u-001",
      type: "mindmap",
      visibility: "project-visible",
      storage_path: "uploads/a-005-mindmap.mindmap",
      metadata: {
        title: "思维导图 - Preview",
        tool_type: "studio_card:knowledge_mindmap",
        content_snapshot: {
          kind: "mindmap",
          title: "停止等待协议效率问题",
        },
      },
      created_at: "2026-04-01T10:00:00.000Z",
      updated_at: "2026-04-01T10:01:00.000Z",
    } as any);

    expect(item.title).toBe("停止等待协议效率问题");
  });

  it("derives mindmap history title from root node when metadata title is generic", () => {
    const item = toArtifactHistoryItem({
      id: "a-005-mindmap-root",
      project_id: "p-001",
      session_id: "s-001",
      based_on_version_id: null,
      owner_user_id: "u-001",
      type: "mindmap",
      visibility: "project-visible",
      storage_path: "uploads/a-005-mindmap-root.mindmap",
      metadata: {
        title: "知识导图",
        tool_type: "studio_card:knowledge_mindmap",
        content_snapshot: {
          kind: "mindmap",
          nodes: [
            { id: "root", title: "信道利用率", parent_id: null },
            { id: "child-1", title: "停止等待协议", parent_id: "root" },
          ],
        },
      },
      created_at: "2026-04-01T10:00:00.000Z",
      updated_at: "2026-04-01T10:01:00.000Z",
    } as any);

    expect(item.title).toBe("信道利用率");
  });

  it("uses content_snapshot scope for quiz history when metadata title is preview garbage", () => {
    const item = toArtifactHistoryItem({
      id: "a-quiz-001",
      project_id: "p-001",
      session_id: "s-001",
      based_on_version_id: null,
      owner_user_id: "u-001",
      type: "exercise",
      visibility: "project-visible",
      storage_path: "uploads/a-quiz-001.json",
      metadata: {
        title: "Quiz - Preview",
        tool_type: "studio_card:interactive_quick_quiz",
        content_snapshot: {
          kind: "quiz",
          scope: "牛顿第二定律",
        },
      },
      created_at: "2026-04-01T10:00:00.000Z",
      updated_at: "2026-04-01T10:01:00.000Z",
    } as any);

    expect(item.title).toBe("牛顿第二定律 小测");
  });

  it("cleans config garbage suffix from word history title", () => {
    const item = toArtifactHistoryItem({
      id: "a-006",
      project_id: "p-001",
      session_id: "s-001",
      based_on_version_id: null,
      owner_user_id: "u-001",
      type: "docx",
      visibility: "project-visible",
      storage_path: "uploads/a-006.docx",
      metadata: {
        title: "计算机网络 物理层教案；standard",
      },
      created_at: "2026-04-01T10:00:00.000Z",
      updated_at: "2026-04-01T10:01:00.000Z",
    } as any);

    expect(item.title).toBe("计算机网络 物理层教案");
  });

  it("does not keep numbered run placeholder title for word artifacts", () => {
    const item = toArtifactHistoryItem({
      id: "a-007",
      project_id: "p-001",
      session_id: "s-001",
      based_on_version_id: null,
      owner_user_id: "u-001",
      type: "docx",
      visibility: "project-visible",
      storage_path: "uploads/a-007.docx",
      metadata: {
        run_title: "第31次讲义文档",
        content_snapshot: {
          kind: "teaching_document",
          topic: "计算机网络物理层",
        },
      },
      created_at: "2026-04-01T10:00:00.000Z",
      updated_at: "2026-04-01T10:01:00.000Z",
    } as any);

    expect(item.title).toBe("计算机网络物理层 教案");
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
