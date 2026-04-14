import { render, screen } from "@testing-library/react";
import type { StudioHistoryItem } from "@/components/project/features/studio/history/types";
import { SessionArtifacts } from "@/components/project/features/studio/components/SessionArtifacts";

function makeHistoryItem(
  overrides: Partial<StudioHistoryItem> = {}
): StudioHistoryItem {
  return {
    id: "workflow:ppt:run-1",
    origin: "workflow",
    toolType: "ppt",
    title: "PPT Run",
    status: "processing",
    createdAt: "2026-04-14T10:00:00.000Z",
    sessionId: "session-1",
    step: "preview",
    runId: "run-1",
    runNo: 1,
    ...overrides,
  };
}

describe("session artifacts ppt status rendering", () => {
  it("shows PPT completed as 已完成 and non-PPT completed as 可预览", () => {
    const pptCompleted = makeHistoryItem({
      status: "completed",
      step: "preview",
      ppt_status: "slide_preview_ready",
    });
    const wordCompleted = makeHistoryItem({
      id: "workflow:word:run-2",
      toolType: "word",
      title: "Word Run",
      status: "completed",
      step: "preview",
      ppt_status: undefined,
    });

    render(
      <SessionArtifacts
        groupedHistory={[
          ["ppt", [pptCompleted]],
          ["word", [wordCompleted]],
        ]}
        toolLabels={{ ppt: "PPT", word: "Word" }}
        onRefresh={async () => undefined}
        onOpenHistoryItem={() => undefined}
        onArchiveHistoryItem={() => undefined}
      />
    );

    expect(screen.getByText("已完成")).toBeInTheDocument();
    expect(screen.getByText("可预览")).toBeInTheDocument();
  });

  it("renders PPT granular in-progress labels", () => {
    const outlineGenerating = makeHistoryItem({
      id: "workflow:ppt:run-3",
      status: "draft",
      step: "outline",
      ppt_status: "outline_generating",
      title: "Outline generating",
    });
    const outlinePending = makeHistoryItem({
      id: "workflow:ppt:run-4",
      status: "draft",
      step: "outline",
      ppt_status: "outline_pending_confirm",
      title: "Outline pending",
    });
    const slidesGenerating = makeHistoryItem({
      id: "workflow:ppt:run-5",
      status: "processing",
      step: "preview",
      ppt_status: "slides_generating",
      title: "Slides generating",
    });
    const slidePreviewReady = makeHistoryItem({
      id: "workflow:ppt:run-6",
      status: "previewing",
      step: "preview",
      ppt_status: "slide_preview_ready",
      title: "Slide preview ready",
    });

    render(
      <SessionArtifacts
        groupedHistory={[
          [
            "ppt",
            [
              outlineGenerating,
              outlinePending,
              slidesGenerating,
              slidePreviewReady,
            ],
          ],
        ]}
        toolLabels={{ ppt: "PPT" }}
        onRefresh={async () => undefined}
        onOpenHistoryItem={() => undefined}
        onArchiveHistoryItem={() => undefined}
      />
    );

    expect(screen.getByText("大纲生成中")).toBeInTheDocument();
    expect(screen.getByText("大纲待确认")).toBeInTheDocument();
    expect(screen.getByText("课件生成中")).toBeInTheDocument();
    expect(screen.getByText("单页可预览")).toBeInTheDocument();
  });
});

