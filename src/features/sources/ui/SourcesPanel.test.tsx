import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { renderWithIntl } from "../../../../tests/render";
import type { SourceClientActions } from "../client-actions";
import type { ArtifactSource, Source, WorkspaceReferenceSource } from "../types";
import { SourcesPanel, sourceNeedsStatusRefresh } from "./SourcesPanel";

const storedSource: Source = {
  id: "0198ebec-17f0-7500-8000-000000000001",
  workspaceId: "0198ebec-17f0-7500-8000-000000000002",
  kind: "uploadedFile",
  originalFilename: "课堂材料.pdf",
  sizeBytes: 1024,
  state: "stored",
  failureCode: null,
  uploadGeneration: 1,
  uploadExpiresAt: null,
  ingestion: null,
  createdAt: "2026-07-15T00:00:00.000Z",
  updatedAt: "2026-07-15T00:00:00.000Z",
};

const workspaceReferenceSource: WorkspaceReferenceSource = {
  id: "0198ebec-17f0-7500-8000-000000000003",
  workspaceId: storedSource.workspaceId,
  kind: "workspaceReference",
  accessState: "available",
  targetWorkspace: {
    id: "0198ebec-17f0-7500-8000-000000000004",
    name: "区块链课程",
    ownerHandle: "lin",
    canonicalHref: "/lin/course-notes",
    updatedAt: "2026-07-15T01:00:00.000Z",
  },
  createdAt: "2026-07-15T01:00:00.000Z",
  updatedAt: "2026-07-15T01:00:00.000Z",
};

const unavailableWorkspaceReferenceSource: WorkspaceReferenceSource = {
  id: "0198ebec-17f0-7500-8000-000000000009",
  workspaceId: storedSource.workspaceId,
  kind: "workspaceReference",
  accessState: "unavailable",
  createdAt: "2026-07-15T01:00:00.000Z",
  updatedAt: "2026-07-15T01:00:00.000Z",
};

const artifactSource: ArtifactSource = {
  id: "0198ebec-17f0-7500-8000-000000000005",
  workspaceId: storedSource.workspaceId,
  kind: "artifact",
  artifact: {
    id: "0198ebec-17f0-7500-8000-000000000006",
    kind: "teaching_document",
    title: "贝叶斯分类器教学文档",
    conversationId: "0198ebec-17f0-7500-8000-000000000007",
    generationState: "ready",
    createdAt: "2026-07-15T02:00:00.000Z",
    updatedAt: "2026-07-15T02:00:00.000Z",
    currentRevision: {
      id: "0198ebec-17f0-7500-8000-000000000008",
      revisionNumber: 2,
    },
  },
  knowledgeIndex: {
    state: "ready",
    chunkCount: 12,
    failureCode: null,
    retryCount: 0,
    nextRetryAt: null,
    updatedAt: "2026-07-15T02:00:00.000Z",
  },
  createdAt: "2026-07-15T02:00:00.000Z",
  updatedAt: "2026-07-15T02:00:00.000Z",
};

function sourceActions(): SourceClientActions {
  return {
    list: vi.fn().mockResolvedValue({ ok: true, data: [storedSource] }),
    listReferenceCandidates: vi
      .fn()
      .mockResolvedValue({ ok: true, data: { candidates: [], totalOtherWorkspaces: 0 } }),
    resolveReferenceLocator: vi.fn(),
    addReference: vi.fn(),
    start: vi.fn(),
    prepare: vi.fn(),
    complete: vi.fn(),
    ingest: vi.fn(),
    remove: vi.fn().mockResolvedValue({ ok: true, data: { cleanupPending: false } }),
  };
}

test("renders persisted sources and removes a confirmed source from the list", async () => {
  const actions = sourceActions();
  vi.mocked(actions.list).mockResolvedValue({ ok: true, data: [] });
  renderWithIntl(
    <SourcesPanel
      actions={actions}
      initialSources={[storedSource]}
      workspaceId={storedSource.workspaceId}
    />,
  );

  expect(screen.getByText("课堂材料.pdf")).toBeInTheDocument();
  expect(screen.getByText("已上传，等待处理")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "删除 课堂材料.pdf" }));
  expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "删除" }));

  await waitFor(() => expect(actions.remove).toHaveBeenCalledWith(storedSource.id));
  await waitFor(() => expect(screen.queryByText("课堂材料.pdf")).not.toBeInTheDocument());
});

test("searches, adds, opens, and removes a Workspace reference", async () => {
  const actions = sourceActions();
  vi.mocked(actions.listReferenceCandidates).mockResolvedValue({
    ok: true,
    data: {
      candidates: [
        {
          id: workspaceReferenceSource.targetWorkspace.id,
          name: workspaceReferenceSource.targetWorkspace.name,
          ownerHandle: workspaceReferenceSource.targetWorkspace.ownerHandle,
          relationship: "owned",
          canonicalHref: workspaceReferenceSource.targetWorkspace.canonicalHref,
          updatedAt: workspaceReferenceSource.targetWorkspace.updatedAt,
        },
      ],
      totalOtherWorkspaces: 1,
    },
  });
  vi.mocked(actions.addReference).mockResolvedValue({
    ok: true,
    data: workspaceReferenceSource,
  });
  renderWithIntl(
    <SourcesPanel actions={actions} initialSources={[]} workspaceId={storedSource.workspaceId} />,
  );

  fireEvent.pointerDown(screen.getByRole("button", { name: "导入" }), {
    button: 0,
    ctrlKey: false,
  });
  fireEvent.click(screen.getByRole("menuitem", { name: "引用工作空间" }));

  const search = await screen.findByRole("textbox", { name: "搜索工作空间" });
  fireEvent.change(search, { target: { value: "区块链" } });
  fireEvent.click(await screen.findByRole("button", { name: "引用" }));

  await waitFor(() =>
    expect(actions.addReference).toHaveBeenCalledWith(
      storedSource.workspaceId,
      workspaceReferenceSource.targetWorkspace.id,
    ),
  );
  expect(await screen.findByText("区块链课程")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "打开 区块链课程" })).toHaveAttribute(
    "href",
    workspaceReferenceSource.targetWorkspace.canonicalHref,
  );

  fireEvent.click(screen.getByRole("button", { name: "移除对 区块链课程 的引用" }));
  expect(
    screen.getByText("只会移除对“区块链课程”的引用，不会删除目标工作空间或其中资料。"),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "移除引用" }));

  await waitFor(() => expect(actions.remove).toHaveBeenCalledWith(workspaceReferenceSource.id));
  await waitFor(() => expect(screen.queryByText("区块链课程")).not.toBeInTheDocument());
});

test("uses one input for workspace search and shared-link recognition", async () => {
  const actions = sourceActions();
  vi.mocked(actions.listReferenceCandidates).mockResolvedValue({
    ok: true,
    data: {
      candidates: [],
      totalOtherWorkspaces: 0,
    },
  });
  vi.mocked(actions.resolveReferenceLocator).mockResolvedValue({
    ok: true,
    data: {
      candidate: {
        id: workspaceReferenceSource.targetWorkspace.id,
        name: workspaceReferenceSource.targetWorkspace.name,
        ownerHandle: workspaceReferenceSource.targetWorkspace.ownerHandle,
        relationship: "shared",
        canonicalHref: workspaceReferenceSource.targetWorkspace.canonicalHref,
        updatedAt: workspaceReferenceSource.targetWorkspace.updatedAt,
      },
      resolvedFromRedirect: false,
    },
  });
  renderWithIntl(
    <SourcesPanel actions={actions} initialSources={[]} workspaceId={storedSource.workspaceId} />,
  );

  fireEvent.pointerDown(screen.getByRole("button", { name: "导入" }), {
    button: 0,
    ctrlKey: false,
  });
  fireEvent.click(screen.getByRole("menuitem", { name: "引用工作空间" }));

  const search = await screen.findByRole("textbox", { name: "搜索工作空间" });
  expect(screen.queryByRole("button", { name: "通过链接" })).not.toBeInTheDocument();

  fireEvent.change(search, { target: { value: "lin/course-notes" } });

  expect(await screen.findByText("区块链课程")).toBeInTheDocument();
  expect(actions.resolveReferenceLocator).toHaveBeenCalledWith(
    storedSource.workspaceId,
    "lin/course-notes",
  );
  expect(screen.queryByRole("button", { name: "检查链接" })).not.toBeInTheDocument();
});

test("places Workspace sources before uploaded files and gives them a distinct source identity", () => {
  const { container } = renderWithIntl(
    <SourcesPanel
      actions={sourceActions()}
      initialSources={[storedSource, workspaceReferenceSource]}
      workspaceId={storedSource.workspaceId}
    />,
  );

  const sourceItems = container.querySelectorAll("[data-source-kind]");
  expect(sourceItems[0]).toHaveAttribute("data-source-kind", "workspace");
  expect(sourceItems[0]).toHaveTextContent("区块链课程");
  expect(sourceItems[0]).toHaveTextContent("知识网络");
  expect(sourceItems[0]).toHaveTextContent("已连接");
  expect(sourceItems[0]?.querySelector("svg")).toBeInTheDocument();
  expect(sourceItems[0]?.querySelector(".workspace-reference-source-icon")).toBeInTheDocument();
  expect(screen.getByText("知识网络")).toHaveClass("workspace-reference-type-label");
  expect(screen.getByText("知识网络")).not.toHaveAttribute("data-studio-tone");
  expect(sourceItems[1]).toHaveTextContent("课堂材料.pdf");
});

test("renders an unavailable reference without target metadata and lets a Source manager remove it", () => {
  const { container } = renderWithIntl(
    <SourcesPanel
      actions={sourceActions()}
      initialSources={[unavailableWorkspaceReferenceSource]}
      workspaceId={storedSource.workspaceId}
    />,
  );

  expect(screen.getByText("引用的工作空间不可用")).toBeInTheDocument();
  expect(screen.getByText("无权访问或已不可用")).toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  const icon = container.querySelector(".workspace-source-file-icon");
  expect(icon).not.toHaveClass("workspace-reference-source-icon");
  expect(icon).toHaveStyle("--source-icon-foreground-light: #52525b");
  fireEvent.click(screen.getByRole("button", { name: "移除对 引用的工作空间不可用 的引用" }));
  expect(
    screen.getByText("只会移除这条不可用引用，不会删除任何工作空间或资料。"),
  ).toBeInTheDocument();
});

test("explains permission filtering to a read-only workspace visitor", () => {
  renderWithIntl(
    <SourcesPanel
      actions={sourceActions()}
      canManage={false}
      initialSources={[workspaceReferenceSource]}
      workspaceId={storedSource.workspaceId}
    />,
  );

  expect(screen.getByText("可用资料会按你的访问权限过滤")).toBeInTheDocument();
});

test("renders Artifact Sources between Workspace references and uploads with source-only removal", async () => {
  const actions = sourceActions();
  let finishRemoval: (() => void) | undefined;
  vi.mocked(actions.remove).mockImplementation(
    () =>
      new Promise((resolve) => {
        finishRemoval = () => resolve({ ok: true, data: { cleanupPending: false } });
      }),
  );
  const { container } = renderWithIntl(
    <SourcesPanel
      actions={actions}
      initialSources={[storedSource, artifactSource, workspaceReferenceSource]}
      workspaceId={storedSource.workspaceId}
    />,
  );
  const sourceItems = container.querySelectorAll("[data-source-kind]");
  expect(sourceItems[0]).toHaveAttribute("data-source-kind", "workspace");
  expect(sourceItems[1]).toHaveAttribute("data-source-kind", "artifact");
  expect(sourceItems[2]).toHaveAttribute("data-source-kind", "file");
  expect(sourceItems[1]).toHaveTextContent("教学文档");
  expect(screen.getByText("已就绪 · 12 个片段")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "打开 贝叶斯分类器教学文档" })).toHaveAttribute(
    "href",
    `?conversation=${artifactSource.artifact.conversationId}&artifact=${artifactSource.artifact.id}`,
  );
  expect(
    screen.queryByRole("button", { name: "处理 贝叶斯分类器教学文档" }),
  ).not.toBeInTheDocument();
  const removeButton = screen.getByRole("button", {
    name: "从资料来源移除 贝叶斯分类器教学文档",
  });
  expect(removeButton.querySelector(".lucide-folder-minus")).toBeInTheDocument();
  expect(removeButton.querySelector(".lucide-trash-2")).not.toBeInTheDocument();
  fireEvent.click(removeButton);
  expect(
    screen.getByText("只会将“贝叶斯分类器教学文档”从资料来源移除，成果及其历史记录仍会保留。"),
  ).toBeInTheDocument();
  const confirmButton = screen.getByRole("button", { name: "从资料来源移除" });
  expect(confirmButton).toHaveStyle({
    backgroundColor: "var(--app-danger-solid)",
    color: "var(--app-on-danger)",
  });
  expect(confirmButton).toHaveClass("active:scale-[0.97]");
  fireEvent.click(confirmButton);
  await waitFor(() => expect(actions.remove).toHaveBeenCalledWith(artifactSource.id));
  const pendingButton = screen.getByRole("button", { name: "正在移除…" });
  expect(pendingButton).toBeDisabled();
  expect(pendingButton).toHaveAttribute("aria-busy", "true");
  expect(pendingButton.querySelector(".animate-spin")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
  finishRemoval?.();
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
});

test("uses the native mind-map and quiz identities with the same source interactions", async () => {
  const actions = sourceActions();
  const mindMap = {
    ...artifactSource,
    id: "0198ebec-17f0-7500-8000-000000000009",
    artifact: {
      ...artifactSource.artifact,
      id: "0198ebec-17f0-7500-8000-000000000010",
      kind: "mind_map" as const,
      title: "贝叶斯思维导图",
    },
  };
  const quiz = {
    ...artifactSource,
    id: "0198ebec-17f0-7500-8000-000000000011",
    artifact: {
      ...artifactSource.artifact,
      id: "0198ebec-17f0-7500-8000-000000000012",
      kind: "quiz" as const,
      title: "贝叶斯随堂小测",
    },
  };
  const { container } = renderWithIntl(
    <SourcesPanel
      actions={actions}
      initialSources={[mindMap, quiz]}
      workspaceId={storedSource.workspaceId}
    />,
  );
  const artifacts = container.querySelectorAll('[data-source-kind="artifact"]');

  expect(artifacts[0]).toHaveTextContent("思维导图");
  expect(artifacts[0]?.querySelector(".lucide-network")).toBeInTheDocument();
  expect(artifacts[0]?.querySelector(".workspace-artifact-source-icon")).toHaveAttribute(
    "data-studio-tone",
    "teal",
  );
  expect(screen.getByText("思维导图")).toHaveClass("workspace-artifact-type-label");
  expect(screen.getByText("思维导图")).toHaveAttribute("data-studio-tone", "teal");
  expect(artifacts[1]).toHaveTextContent("随堂小测");
  expect(artifacts[1]?.querySelector(".lucide-clipboard-check")).toBeInTheDocument();
  expect(artifacts[1]?.querySelector(".workspace-artifact-source-icon")).toHaveAttribute(
    "data-studio-tone",
    "violet",
  );
  expect(screen.getByText("随堂小测")).toHaveAttribute("data-studio-tone", "violet");
  expect(screen.getByRole("link", { name: "打开 贝叶斯思维导图" })).toHaveAttribute(
    "href",
    expect.stringContaining(`artifact=${mindMap.artifact.id}`),
  );
  expect(screen.getByRole("link", { name: "打开 贝叶斯随堂小测" })).toHaveAttribute(
    "href",
    expect.stringContaining(`artifact=${quiz.artifact.id}`),
  );

  fireEvent.click(screen.getByRole("button", { name: "从资料来源移除 贝叶斯思维导图" }));
  expect(
    screen.getByText("只会将“贝叶斯思维导图”从资料来源移除，成果及其历史记录仍会保留。"),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "取消" }));

  fireEvent.click(screen.getByRole("button", { name: "从资料来源移除 贝叶斯随堂小测" }));
  expect(
    screen.getByText("只会将“贝叶斯随堂小测”从资料来源移除，成果及其历史记录仍会保留。"),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "从资料来源移除" }));
  await waitFor(() => expect(actions.remove).toHaveBeenCalledWith(quiz.id));
});

test("refreshes active Artifact indexing states without relying on file ingestion", () => {
  if (!artifactSource.knowledgeIndex) throw new Error("Artifact index fixture failed");
  expect(
    sourceNeedsStatusRefresh({
      ...artifactSource,
      knowledgeIndex: { ...artifactSource.knowledgeIndex, state: "projecting" },
    }),
  ).toBe(true);
  expect(sourceNeedsStatusRefresh(artifactSource)).toBe(false);
});

test("renders distinct line icons for each supported file family", () => {
  const files = [
    { id: "0198ebec-17f0-7500-8000-000000000011", originalFilename: "讲义.pdf" },
    { id: "0198ebec-17f0-7500-8000-000000000012", originalFilename: "教案.docx" },
    { id: "0198ebec-17f0-7500-8000-000000000013", originalFilename: "课件.pptx" },
    { id: "0198ebec-17f0-7500-8000-000000000019", originalFilename: "成绩.xlsx" },
    { id: "0198ebec-17f0-7500-8000-000000000020", originalFilename: "说明.md" },
    { id: "0198ebec-17f0-7500-8000-000000000021", originalFilename: "数据.csv" },
    { id: "0198ebec-17f0-7500-8000-000000000022", originalFilename: "配置.json" },
    { id: "0198ebec-17f0-7500-8000-000000000023", originalFilename: "程序.py" },
    { id: "0198ebec-17f0-7500-8000-000000000024", originalFilename: "字幕.vtt" },
    { id: "0198ebec-17f0-7500-8000-000000000025", originalFilename: "实验.ipynb" },
    { id: "0198ebec-17f0-7500-8000-000000000014", originalFilename: "插图.png" },
    { id: "0198ebec-17f0-7500-8000-000000000015", originalFilename: "访谈.mp3" },
    { id: "0198ebec-17f0-7500-8000-000000000017", originalFilename: "课堂录像.mp4" },
  ].map((file) => ({ ...storedSource, ...file }));
  const { container } = renderWithIntl(
    <SourcesPanel
      actions={sourceActions()}
      initialSources={files}
      workspaceId={storedSource.workspaceId}
    />,
  );

  expect(container.querySelector(".lucide-file-text")).toBeInTheDocument();
  expect(container.querySelector(".lucide-file-pen-line")).toBeInTheDocument();
  expect(container.querySelector(".lucide-presentation")).toBeInTheDocument();
  expect(container.querySelector(".lucide-file-spreadsheet")).toBeInTheDocument();
  expect(container.querySelector(".lucide-file-type-corner")).toBeInTheDocument();
  expect(container.querySelector(".lucide-table-2")).toBeInTheDocument();
  expect(container.querySelector(".lucide-braces")).toBeInTheDocument();
  expect(container.querySelector(".lucide-file-code-corner")).toBeInTheDocument();
  expect(container.querySelector(".lucide-captions")).toBeInTheDocument();
  expect(container.querySelector(".lucide-notebook-tabs")).toBeInTheDocument();
  expect(container.querySelector(".lucide-image")).toBeInTheDocument();
  expect(container.querySelector(".lucide-audio-lines")).toBeInTheDocument();
  expect(container.querySelector(".lucide-clapperboard")).toBeInTheDocument();
});

test("renders audio-specific processing state", () => {
  renderWithIntl(
    <SourcesPanel
      actions={sourceActions()}
      initialSources={[
        {
          ...storedSource,
          originalFilename: "访谈.wav",
          ingestion: {
            id: "0198ebec-17f0-7500-8000-000000000016",
            provider: "media_understanding",
            state: "processing",
            attemptNumber: 1,
            retryable: false,
            errorCode: null,
            updatedAt: "2026-07-15T00:00:00.000Z",
          },
        },
      ]}
      workspaceId={storedSource.workspaceId}
    />,
  );

  expect(screen.getByText("正在分析音频")).toBeInTheDocument();
});

test("renders video-specific processing state", () => {
  renderWithIntl(
    <SourcesPanel
      actions={sourceActions()}
      initialSources={[
        {
          ...storedSource,
          originalFilename: "课堂录像.mov",
          ingestion: {
            id: "0198ebec-17f0-7500-8000-000000000018",
            provider: "media_understanding",
            state: "processing",
            attemptNumber: 1,
            retryable: false,
            errorCode: null,
            updatedAt: "2026-07-15T00:00:00.000Z",
          },
        },
      ]}
      workspaceId={storedSource.workspaceId}
    />,
  );

  expect(screen.getByText("正在分析视频")).toBeInTheDocument();
});

test("renders the completed parsing stage for a ready document", () => {
  renderWithIntl(
    <SourcesPanel
      actions={sourceActions()}
      initialSources={[
        {
          ...storedSource,
          originalFilename: "教案.docx",
          ingestion: {
            id: "0198ebec-17f0-7500-8000-000000000025",
            provider: "mineru",
            state: "ready",
            attemptNumber: 1,
            retryable: false,
            errorCode: null,
            updatedAt: "2026-07-15T00:00:00.000Z",
          },
        },
      ]}
      workspaceId={storedSource.workspaceId}
    />,
  );

  expect(screen.getByText("等待建立索引")).toBeInTheDocument();
});

test.each([
  ["queued", null, "准备索引", "bg-amber-400", false],
  ["projecting", null, "正在建立索引", "bg-[var(--app-info)]", true],
  ["publishing", null, "正在建立索引", "bg-[var(--app-info)]", true],
  ["ready", null, "已就绪 · 12 个片段", "bg-emerald-500", false],
  ["failed", "2026-07-15T00:05:00.000Z", "索引失败，已安排自动重试", "bg-red-500", false],
] as const)("renders Knowledge index state %s", (state, nextRetryAt, expected, expectedDotClass, shouldPulse) => {
  renderWithIntl(
    <SourcesPanel
      actions={sourceActions()}
      initialSources={[
        {
          ...storedSource,
          ingestion: {
            id: "0198ebec-17f0-7500-8000-000000000025",
            provider: "mineru",
            state: "ready",
            attemptNumber: 1,
            retryable: false,
            errorCode: null,
            updatedAt: "2026-07-15T00:00:00.000Z",
          },
          knowledgeIndex: {
            state,
            chunkCount: 12,
            failureCode: state === "failed" ? "knowledge_embedding_unavailable" : null,
            retryCount: state === "failed" ? 1 : 0,
            nextRetryAt,
            updatedAt: "2026-07-15T00:01:00.000Z",
          },
        },
      ]}
      workspaceId={storedSource.workspaceId}
    />,
  );

  const card = screen.getByText(expected).closest(".workspace-sources-rail-item");
  const statusIndicator = card?.querySelector(".workspace-sources-actions > span");
  expect(statusIndicator).toHaveClass(expectedDotClass);
  if (shouldPulse) expect(statusIndicator).toHaveClass("animate-pulse");
  else expect(statusIndicator).not.toHaveClass("animate-pulse");
});

test("polls while ingestion or Knowledge indexing can still advance", () => {
  const readyIngestion: Source = {
    ...storedSource,
    ingestion: {
      id: "0198ebec-17f0-7500-8000-000000000025",
      provider: "mineru",
      state: "ready",
      attemptNumber: 1,
      retryable: false,
      errorCode: null,
      updatedAt: "2026-07-15T00:00:00.000Z",
    },
  };
  const withinSchedulingGrace = Date.parse("2026-07-15T00:00:30.000Z");
  expect(sourceNeedsStatusRefresh(readyIngestion, withinSchedulingGrace)).toBe(true);
  expect(
    sourceNeedsStatusRefresh(
      {
        ...readyIngestion,
        knowledgeIndex: {
          state: "publishing",
          chunkCount: 0,
          failureCode: null,
          retryCount: 0,
          nextRetryAt: null,
          updatedAt: "2026-07-15T00:00:31.000Z",
        },
      },
      withinSchedulingGrace,
    ),
  ).toBe(true);
  expect(
    sourceNeedsStatusRefresh(
      {
        ...readyIngestion,
        knowledgeIndex: {
          state: "ready",
          chunkCount: 12,
          failureCode: null,
          retryCount: 0,
          nextRetryAt: null,
          updatedAt: "2026-07-15T00:00:31.000Z",
        },
      },
      withinSchedulingGrace,
    ),
  ).toBe(false);
});

test("starts a missing ingestion and renders its queued state", async () => {
  const actions = sourceActions();
  const ingestion = {
    id: "0198ebec-17f0-7500-8000-000000000004",
    provider: "mineru" as const,
    state: "queued" as const,
    attemptNumber: 1,
    retryable: false,
    errorCode: null,
    updatedAt: "2026-07-15T00:00:00.000Z",
  };
  vi.mocked(actions.ingest).mockResolvedValue({ ok: true, data: ingestion });
  renderWithIntl(
    <SourcesPanel
      actions={actions}
      initialSources={[storedSource]}
      workspaceId={storedSource.workspaceId}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "处理 课堂材料.pdf" }));

  await waitFor(() => expect(actions.ingest).toHaveBeenCalledWith(storedSource.id));
  expect(await screen.findByText("等待解析")).toBeInTheDocument();
});

test("offers retry only for retryable processing failures", () => {
  const failed: Source = {
    ...storedSource,
    ingestion: {
      id: "0198ebec-17f0-7500-8000-000000000005",
      provider: "mineru",
      state: "failed" as const,
      attemptNumber: 1,
      retryable: true,
      errorCode: "mineru_unavailable",
      updatedAt: "2026-07-15T00:00:00.000Z",
    },
  };
  renderWithIntl(
    <SourcesPanel
      actions={sourceActions()}
      initialSources={[failed]}
      workspaceId={failed.workspaceId}
    />,
  );

  expect(screen.getByText("处理服务暂时不可用，请稍后重试")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "处理 课堂材料.pdf" })).toBeEnabled();
});

test("keeps the confirmation open when deletion fails", async () => {
  const actions = sourceActions();
  vi.mocked(actions.remove).mockResolvedValue({
    ok: false,
    code: "source_storage_unavailable",
  });
  renderWithIntl(
    <SourcesPanel
      actions={actions}
      initialSources={[storedSource]}
      workspaceId={storedSource.workspaceId}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "删除 课堂材料.pdf" }));
  fireEvent.click(screen.getByRole("button", { name: "删除" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("对象存储暂时不可用");
  expect(screen.getByText("课堂材料.pdf")).toBeInTheDocument();
});

test("does not claim a persisted pending Source can resume without local file bytes", () => {
  const pendingSource: Source = {
    ...storedSource,
    id: "0198ebec-17f0-7500-8000-000000000003",
    originalFilename: "中断上传.pdf",
    state: "pending_upload",
    uploadExpiresAt: "2026-07-15T00:15:00.000Z",
  };

  renderWithIntl(
    <SourcesPanel
      actions={sourceActions()}
      initialSources={[pendingSource]}
      workspaceId={pendingSource.workspaceId}
    />,
  );

  expect(screen.getByText("上传未完成，请删除后重新选择文件")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "重新上传 中断上传.pdf" })).not.toBeInTheDocument();
});

test("allows the same file to be selected again when upload setup fails", async () => {
  const actions = sourceActions();
  vi.mocked(actions.start).mockResolvedValue({
    ok: false,
    code: "source_storage_unavailable",
  });
  const { container } = renderWithIntl(
    <SourcesPanel actions={actions} initialSources={[]} workspaceId={storedSource.workspaceId} />,
  );
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("Missing source file input");
  const file = new File(["content"], "retry.pdf", { type: "application/pdf" });

  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => expect(actions.start).toHaveBeenCalledTimes(1));
  await screen.findByRole("alert");
  fireEvent.change(input, { target: { files: [file] } });

  await waitFor(() => expect(actions.start).toHaveBeenCalledTimes(2));
});

test("rejects native text above its format limit before creating a Source", async () => {
  const actions = sourceActions();
  const { container } = renderWithIntl(
    <SourcesPanel actions={actions} initialSources={[]} workspaceId={storedSource.workspaceId} />,
  );
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("Missing source file input");
  const file = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "oversized.txt", {
    type: "text/plain",
  });

  fireEvent.change(input, { target: { files: [file] } });

  expect(await screen.findByRole("alert")).toHaveTextContent("文件超过该格式允许的大小限制");
  expect(actions.start).not.toHaveBeenCalled();
});
