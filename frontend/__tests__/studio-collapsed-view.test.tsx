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
  it("renders journey guide and recommended next tools", () => {
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

    expect(screen.getByText("成果链导览")).toBeInTheDocument();
    expect(screen.getByText(/当前阶段：/)).toBeInTheDocument();
    expect(screen.getByText("讲稿备注")).toBeInTheDocument();
    expect(
      screen.getByText("当前已绑定来源成果，可沿成果链继续推进。")
    ).toBeInTheDocument();
    expect(screen.getByText("扩展演示能力")).toBeInTheDocument();
    expect(screen.getAllByText("演示动画").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("互动游戏").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: "打开教学文档" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开随堂小测" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开思维导图" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "打开教学文档" }));

    const wordTool = GENERATION_TOOLS.find((tool) => tool.type === "word");
    expect(onToolClick).toHaveBeenCalledWith(wordTool);
  });
});
