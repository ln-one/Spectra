import { fireEvent, render, screen } from "@testing-library/react";
import { StudioCollapsedView } from "@/components/project/features/studio/panel/components/StudioCollapsedView";
import type { StudioHistoryItem } from "@/components/project/features/studio/history/types";
import { GENERATION_TOOLS } from "@/stores/projectStore";

function makeHistoryItem(
  overrides: Partial<StudioHistoryItem> = {}
): StudioHistoryItem {
  return {
    id: "artifact:summary:1",
    origin: "artifact",
    toolType: "summary",
    title: "牛顿第二定律讲稿",
    status: "completed",
    createdAt: "2026-04-17T08:00:00.000Z",
    sessionId: "session-1",
    step: "preview",
    artifactId: "artifact-speaker-1",
    ...overrides,
  };
}

describe("StudioCollapsedView", () => {
  it("renders only the tool grid and artifact history in collapsed mode", () => {
    const onToolClick = jest.fn();

    render(
      <StudioCollapsedView
        isExpanded={false}
        hoveredToolId={null}
        onHoveredToolIdChange={() => undefined}
        onToolClick={onToolClick}
        hasHistory
        groupedHistory={[
          [
            "summary",
            [makeHistoryItem()],
          ],
        ]}
        currentCardId="speaker_notes"
        selectedSourceId="ppt-artifact-1"
        latestArtifacts={[
          {
            artifactId: "artifact-speaker-1",
            title: "牛顿第二定律讲稿",
            status: "completed",
            createdAt: "2026-04-17T08:00:00.000Z",
            sourceArtifactId: "ppt-artifact-1",
          },
        ]}
        projectId="project-1"
        activeSessionId="session-1"
        fetchArtifactHistory={async () => undefined}
        onOpenHistoryItem={() => undefined}
        onArchiveHistoryItem={() => undefined}
      />
    );

    expect(screen.queryByText("成果链导览")).not.toBeInTheDocument();
    expect(screen.queryByText("扩展演示能力")).not.toBeInTheDocument();

    expect(screen.getByRole("button", { name: "智能课件" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "教学文档" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "思维导图" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "互动游戏" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "随堂小测" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "演示动画" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "说课助手" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "学情预演" })).toBeInTheDocument();
    expect(screen.getAllByText("牛顿第二定律讲稿").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "说课助手" }));

    expect(
      screen.getByText("当前账号没有开通会员权限，请联系管理员")
    ).toBeInTheDocument();
    expect(onToolClick).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "我知道了" }));
    fireEvent.click(screen.getByRole("button", { name: "教学文档" }));

    const wordTool = GENERATION_TOOLS.find((tool) => tool.type === "word");
    expect(onToolClick).toHaveBeenCalledWith(wordTool);
  });
});
