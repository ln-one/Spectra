import { act, fireEvent, screen } from "@testing-library/react";
import { FileText } from "lucide-react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { formatArtifactHistoryTimestamp } from "@/features/artifacts/artifact-history";
import { renderWithIntl } from "../../../../tests/render";
import { ChatPanelView } from "./ChatPanelView";
import { workbenchVisualFixture } from "./fixture";
import { SourcesPanelView } from "./SourcesPanelView";
import { artifactRailCapacity, StudioPanelView } from "./StudioPanelView";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        "http://localhost",
      );
      if (
        (init?.method === undefined || init.method === "GET") &&
        url.pathname.startsWith("/api/agent/chat/") &&
        url.pathname.endsWith("/stream")
      ) {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("renders panel data supplied by the caller", async () => {
  renderWithIntl(
    <>
      <StudioPanelView
        title="创作工作台"
        subtitle="通用创作工具"
        tools={["teaching-document"]}
        artifactHistory={[]}
        artifactHistoryError={false}
        artifactHref={(id) => `/artifact/${id}`}
        isRefreshingHistory={false}
        onDeleteArtifact={vi.fn()}
        onRefreshHistory={vi.fn()}
        selectedArtifactId={null}
      />
      <ChatPanelView
        conversationId="00000000-0000-4000-8000-000000000001"
        workspaceId="00000000-0000-4000-8000-000000000002"
        title="对话"
        subtitle="知识助手"
        messages={[
          {
            id: "message-1",
            role: "assistant",
            parts: [{ type: "text", text: "来自外部的数据" }],
          },
        ]}
        selectedSourceCount={0}
      />
      <SourcesPanelView
        title="来源"
        summary="1 个文件"
        sources={[
          {
            id: "source-1",
            name: "外部资料.pdf",
            status: "索引完成",
            Icon: FileText,
            kind: "file",
            iconTone: "pdf",
            selected: false,
            canOpen: false,
            canDelete: true,
          },
        ]}
      />
    </>,
  );

  expect(screen.getByText("教学文档")).toBeInTheDocument();
  expect(await screen.findByText("来自外部的数据")).toBeInTheDocument();
  expect(screen.getByText("外部资料.pdf")).toBeInTheDocument();
  expect(screen.queryByText("智能课件")).not.toBeInTheDocument();
  expect(screen.queryByText("proj_mock_base")).not.toBeInTheDocument();
});

test("keeps the full visual fixture isolated to component tests", () => {
  expect(workbenchVisualFixture.studio.tools[0]).toBe("smart-slides");
  expect(workbenchVisualFixture.sources.sources[0]?.name).toBe("proj_mock_base");
});

test("opens Smart Slides through the shared Artifact creation entry", () => {
  const selectTool = vi.fn();
  renderWithIntl(
    <StudioPanelView
      title="创作工作台"
      subtitle="通用创作工具"
      tools={["smart-slides"]}
      artifactHistory={[]}
      artifactHistoryError={false}
      artifactHref={(id) => `/artifact/${id}`}
      isRefreshingHistory={false}
      onDeleteArtifact={vi.fn()}
      onRefreshHistory={vi.fn()}
      onSelectTool={selectTool}
      selectedArtifactId={null}
    />,
  );

  const button = screen.getByRole("button", { name: "智能课件" });
  expect(button).toBeEnabled();
  fireEvent.click(button);
  expect(selectTool).toHaveBeenCalledWith("smart-slides");
});

test("keeps Task Agent cards visible and explains a missing runtime", () => {
  const selectTool = vi.fn();
  renderWithIntl(
    <StudioPanelView
      title="创作工作台"
      subtitle="通用创作工具"
      tools={["smart-slides", "animation"]}
      runtimeUnavailableTools={["smart-slides", "animation"]}
      artifactHistory={[]}
      artifactHistoryError={false}
      artifactHref={(id) => `/artifact/${id}`}
      isRefreshingHistory={false}
      onDeleteArtifact={vi.fn()}
      onRefreshHistory={vi.fn()}
      onSelectTool={selectTool}
      selectedArtifactId={null}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "智能课件" }));
  expect(screen.getByRole("alert")).toHaveTextContent("智能课件入口已开放，但运行环境尚未启动");
  expect(selectTool).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "演示动画" })).toBeVisible();
});

test("renders the compact Studio rail with the existing tool actions", () => {
  const selectTool = vi.fn();
  const expand = vi.fn();
  const showHistory = vi.fn();
  renderWithIntl(
    <StudioPanelView
      title="创作工作台"
      subtitle="通用创作工具"
      tools={["smart-slides", "teaching-document"]}
      artifactHistory={[]}
      artifactHistoryError={false}
      artifactHref={(id) => `/artifact/${id}`}
      collapsed
      isRefreshingHistory={false}
      onDeleteArtifact={vi.fn()}
      onExpand={expand}
      onRefreshHistory={vi.fn()}
      onSelectTool={selectTool}
      onShowHistory={showHistory}
      selectedArtifactId={null}
    />,
  );

  expect(screen.getByTestId("studio-rail")).toBeVisible();
  expect(screen.queryByText("通用创作工具")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "智能课件" }));
  expect(selectTool).toHaveBeenCalledWith("smart-slides");

  fireEvent.click(screen.getByRole("button", { name: "展开备课工坊" }));
  fireEvent.click(screen.getByRole("button", { name: "打开历史记录" }));
  expect(expand).toHaveBeenCalledTimes(1);
  expect(showHistory).toHaveBeenCalledTimes(1);
});

test("fills the compact Studio rail with as many recent artifacts as its height allows", () => {
  const clientHeight = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(168);
  const openArtifact = vi.fn();
  const artifacts = Array.from({ length: 6 }, (_, index) => ({
    createdAt: `2026-07-${String(18 - index).padStart(2, "0")}T01:00:00.000Z`,
    currentRevisionId: `00000000-0000-4000-8000-${String(400 + index).padStart(12, "0")}`,
    generationState: "ready" as const,
    id: `00000000-0000-4000-8000-${String(500 + index).padStart(12, "0")}`,
    kind: index % 2 === 0 ? ("mind_map" as const) : ("quiz" as const),
    title: `最近成果 ${index + 1}`,
    updatedAt: `2026-07-${String(18 - index).padStart(2, "0")}T01:00:00.000Z`,
  }));

  try {
    renderWithIntl(
      <StudioPanelView
        title="创作工作台"
        subtitle="通用创作工具"
        tools={["smart-slides", "teaching-document"]}
        artifactHistory={artifacts}
        artifactHistoryError={false}
        artifactHref={(id) => `/artifact/${id}`}
        collapsed
        isRefreshingHistory={false}
        onDeleteArtifact={vi.fn()}
        onOpenArtifact={openArtifact}
        onRefreshHistory={vi.fn()}
        selectedArtifactId={artifacts[1]?.id ?? null}
      />,
    );

    const visibleArtifacts = screen.getAllByTestId("studio-rail-artifact");
    expect(visibleArtifacts).toHaveLength(4);
    expect(visibleArtifacts[0]).toHaveAttribute("data-studio-tone", "teal");
    expect(visibleArtifacts[1]).toHaveAttribute("data-studio-tone", "violet");
    expect(visibleArtifacts[1]).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "打开历史记录" })).toHaveAttribute(
      "title",
      expect.stringContaining("+2"),
    );

    fireEvent.click(screen.getByRole("link", { name: /最近成果 1/ }));
    expect(openArtifact).toHaveBeenCalledWith(artifacts[0]?.id);
  } finally {
    clientHeight.mockRestore();
  }
});

test("calculates compact rail capacity without clipping partial artifact buttons", () => {
  expect(artifactRailCapacity(7)).toBe(0);
  expect(artifactRailCapacity(48)).toBe(1);
  expect(artifactRailCapacity(88)).toBe(2);
  expect(artifactRailCapacity(168)).toBe(4);
});

test("disables a runtime-unavailable tool in the compact Studio rail", () => {
  const selectTool = vi.fn();
  renderWithIntl(
    <StudioPanelView
      title="创作工作台"
      subtitle="通用创作工具"
      tools={["smart-slides"]}
      runtimeUnavailableTools={["smart-slides"]}
      artifactHistory={[]}
      artifactHistoryError={false}
      artifactHref={(id) => `/artifact/${id}`}
      collapsed
      isRefreshingHistory={false}
      onDeleteArtifact={vi.fn()}
      onRefreshHistory={vi.fn()}
      onSelectTool={selectTool}
      selectedArtifactId={null}
    />,
  );

  const tool = screen.getByRole("button", { name: "智能课件" });
  expect(tool).toBeDisabled();
  expect(tool).toHaveAttribute("title", expect.stringContaining("运行环境尚未启动"));
  fireEvent.click(tool);
  expect(selectTool).not.toHaveBeenCalled();
});

test("renders selectable conversation artifact history and refreshes it", () => {
  const refresh = vi.fn();
  const deleteArtifact = vi.fn().mockResolvedValue(undefined);
  const addArtifactSource = vi.fn().mockResolvedValue(undefined);
  renderWithIntl(
    <StudioPanelView
      title="创作工作台"
      subtitle="通用创作工具"
      tools={[]}
      artifactHistory={[
        {
          createdAt: "2026-07-18T01:00:00.000Z",
          currentRevisionId: "00000000-0000-4000-8000-000000000302",
          generationState: "ready",
          id: "00000000-0000-4000-8000-000000000301",
          kind: "teaching_document",
          title: "区块链教学文档",
          updatedAt: "2026-07-18T01:00:00.000Z",
        },
        {
          createdAt: "2026-07-18T01:00:00.000Z",
          currentRevisionId: "00000000-0000-4000-8000-000000000304",
          generationState: "ready",
          id: "00000000-0000-4000-8000-000000000303",
          kind: "mind_map",
          title: "区块链思维导图",
          updatedAt: "2026-07-18T01:00:00.000Z",
        },
        {
          createdAt: "2026-07-18T01:00:00.000Z",
          currentRevisionId: "00000000-0000-4000-8000-000000000306",
          generationState: "ready",
          id: "00000000-0000-4000-8000-000000000305",
          kind: "quiz",
          title: "区块链随堂小测",
          updatedAt: "2026-07-18T01:00:00.000Z",
        },
      ]}
      artifactHistoryError={true}
      artifactHref={(id) => `/workspace?conversation=1&artifact=${id}`}
      isRefreshingHistory={true}
      onDeleteArtifact={deleteArtifact}
      onAddArtifactSource={addArtifactSource}
      onRefreshHistory={refresh}
      selectedArtifactId="00000000-0000-4000-8000-000000000301"
    />,
  );

  expect(screen.getByRole("link", { name: /区块链教学文档/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(screen.getByRole("link", { name: /区块链思维导图/ }).parentElement).toHaveAttribute(
    "data-studio-tone",
    "teal",
  );
  expect(screen.getByRole("link", { name: /区块链随堂小测/ }).parentElement).toHaveAttribute(
    "data-studio-tone",
    "violet",
  );
  expect(screen.getByRole("alert")).toHaveTextContent("历史记录刷新失败");
  const refreshButton = screen.getByRole("button", { name: "刷新历史记录" });
  expect(refreshButton).toBeDisabled();
  expect(refreshButton).toHaveAttribute("aria-busy", "true");
  expect(refreshButton.querySelector("svg")).toHaveClass("animate-spin");
  const deleteButton = screen.getByRole("button", {
    name: "删除“区块链教学文档”",
  });
  expect(deleteButton).not.toHaveClass("opacity-0");
  fireEvent.click(
    screen.getByRole("button", {
      name: "将“区块链教学文档”加入资料来源",
    }),
  );
  expect(addArtifactSource).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000301");
  fireEvent.click(screen.getByRole("button", { name: "将“区块链思维导图”加入资料来源" }));
  expect(addArtifactSource).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000303");
  fireEvent.click(screen.getByRole("button", { name: "将“区块链随堂小测”加入资料来源" }));
  expect(addArtifactSource).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000305");
  fireEvent.click(deleteButton);
  expect(screen.getByRole("alertdialog")).toHaveTextContent("区块链教学文档");
  fireEvent.click(screen.getByRole("button", { name: "删除成果" }));
  expect(deleteArtifact).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000301");
});

test("does not spin History when a cached item already has a revision", () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date("2026-07-19T08:00:00.000Z"));
    renderWithIntl(
      <StudioPanelView
        title="创作工作台"
        subtitle="通用创作工具"
        tools={[]}
        artifactHistory={[
          {
            createdAt: "2026-07-19T01:00:00.000Z",
            currentRevisionId: "00000000-0000-4000-8000-000000000312",
            generationState: "queued",
            id: "00000000-0000-4000-8000-000000000311",
            kind: "teaching_document",
            title: "已经完成的文档",
            updatedAt: "2026-07-19T01:01:00.000Z",
          },
        ]}
        artifactHistoryError={false}
        artifactHref={(id) => `/workspace?conversation=1&artifact=${id}`}
        isRefreshingHistory={false}
        onDeleteArtifact={vi.fn()}
        onRefreshHistory={vi.fn()}
        selectedArtifactId={null}
      />,
    );

    const historyLink = screen.getByRole("link", { name: /已经完成的文档/ });
    expect(historyLink).toHaveTextContent(
      `${formatArtifactHistoryTimestamp("2026-07-19T01:01:00.000Z", "zh-CN")}更新`,
    );
    expect(historyLink.querySelector(".animate-spin")).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

test("keeps history refresh feedback visible for a perceptible interval", async () => {
  vi.useFakeTimers();
  try {
    const refresh = vi.fn();
    renderWithIntl(
      <StudioPanelView
        title="创作工作台"
        subtitle="通用创作工具"
        tools={[]}
        artifactHistory={[]}
        artifactHistoryError={false}
        artifactHref={(id) => `/workspace?conversation=1&artifact=${id}`}
        isRefreshingHistory={false}
        onDeleteArtifact={vi.fn()}
        onRefreshHistory={refresh}
        selectedArtifactId={null}
      />,
    );

    const refreshButton = screen.getByRole("button", { name: "刷新历史记录" });
    fireEvent.click(refreshButton);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refreshButton).toBeDisabled();
    expect(refreshButton).toHaveAttribute("aria-busy", "true");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(refreshButton).not.toBeDisabled();
    expect(refreshButton).toHaveAttribute("aria-busy", "false");
  } finally {
    vi.useRealTimers();
  }
});

test("renders upload progress, retry, and a dismissible inline upload error", () => {
  const onRetry = vi.fn();
  const onDismiss = vi.fn();
  renderWithIntl(
    <SourcesPanelView
      title="资料来源"
      summary="1 个文件"
      uploadError="只能上传支持的文件格式"
      onDismissUploadError={onDismiss}
      onRequestRetryUpload={onRetry}
      sources={[
        {
          id: "uploading-source",
          name: "报告.pdf",
          status: "正在上传 48%",
          Icon: FileText,
          kind: "file",
          iconTone: "pdf",
          selected: false,
          canOpen: false,
          canDelete: true,
          canRetryUpload: true,
          uploadProgress: 48,
          statusTone: "active",
        },
      ]}
    />,
  );

  expect(screen.getByRole("alert")).toHaveTextContent("只能上传支持的文件格式");
  expect(screen.getByRole("progressbar", { name: "正在上传 报告.pdf：48%" })).toHaveAttribute(
    "aria-valuenow",
    "48",
  );
  fireEvent.click(screen.getByRole("button", { name: "重新上传 报告.pdf" }));
  fireEvent.click(screen.getByRole("button", { name: "关闭上传错误" }));
  expect(onRetry).toHaveBeenCalledTimes(1);
  expect(onDismiss).toHaveBeenCalledTimes(1);
});

test("hands an Artifact Source open action to the workbench transition", () => {
  const onOpen = vi.fn();
  renderWithIntl(
    <SourcesPanelView
      title="资料来源"
      summary="1 项资料"
      onRequestOpen={onOpen}
      sources={[
        {
          id: "artifact-source",
          artifactId: "00000000-0000-4000-8000-000000000021",
          artifactKind: "teaching_document",
          artifactTone: "blue",
          conversationId: "00000000-0000-4000-8000-000000000022",
          name: "贝叶斯分类器",
          status: "索引完成",
          Icon: FileText,
          kind: "artifact",
          openHref: "?conversation=conversation&artifact=artifact",
          selected: false,
          canOpen: true,
          canDelete: true,
        },
      ]}
    />,
  );

  fireEvent.click(screen.getByRole("link", { name: "打开 贝叶斯分类器" }));

  expect(onOpen).toHaveBeenCalledOnce();
  expect(onOpen.mock.calls[0]?.[0]).toMatchObject({
    id: "artifact-source",
    kind: "artifact",
  });
  expect(onOpen.mock.calls[0]?.[1]).toHaveAttribute("data-source-id", "artifact-source");
});
