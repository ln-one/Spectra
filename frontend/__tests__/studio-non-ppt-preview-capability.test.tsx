import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import type {
  CapabilityStatus,
  ToolFlowContext,
} from "@/components/project/features/studio/tools";

jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

jest.mock("remark-gfm", () => ({
  __esModule: true,
  default: () => undefined,
}));

beforeAll(() => {
  class ResizeObserverMock {
    observe() {
      return undefined;
    }
    unobserve() {
      return undefined;
    }
    disconnect() {
      return undefined;
    }
  }
  // @ts-expect-error jsdom runtime polyfill
  global.ResizeObserver = ResizeObserverMock;
});

const { PreviewStep: WordPreviewStep } =
  require("@/components/project/features/studio/tools/word/PreviewStep") as typeof import("@/components/project/features/studio/tools/word/PreviewStep");
const { PreviewStep: MindmapPreviewStep } =
  require("@/components/project/features/studio/tools/mindmap/PreviewStep") as typeof import("@/components/project/features/studio/tools/mindmap/PreviewStep");
const { PreviewStep: QuizPreviewStep } =
  require("@/components/project/features/studio/tools/quiz/PreviewStep") as typeof import("@/components/project/features/studio/tools/quiz/PreviewStep");
const { PreviewStep: GamePreviewStep } =
  require("@/components/project/features/studio/tools/game/PreviewStep") as typeof import("@/components/project/features/studio/tools/game/PreviewStep");
const { PreviewStep: AnimationPreviewStep } =
  require("@/components/project/features/studio/tools/animation/PreviewStep") as typeof import("@/components/project/features/studio/tools/animation/PreviewStep");
const { PreviewStep: SpeakerNotesPreviewStep } =
  require("@/components/project/features/studio/tools/speaker-notes/PreviewStep") as typeof import("@/components/project/features/studio/tools/speaker-notes/PreviewStep");
const { PreviewStep: SimulationPreviewStep } =
  require("@/components/project/features/studio/tools/simulation/PreviewStep") as typeof import("@/components/project/features/studio/tools/simulation/PreviewStep");

function buildFlowContext(
  status: CapabilityStatus,
  reason = "测试原因"
): ToolFlowContext {
  return {
    capabilityStatus: status,
    capabilityReason: reason,
    latestArtifacts: [],
    canRefine: false,
  };
}

describe("non-ppt preview capability notice", () => {
  it("word preview shows backend status and no fake frontend draft", () => {
    render(
      <WordPreviewStep
        markdown=""
        isGenerating={false}
        lastGeneratedAt={null}
        flowContext={buildFlowContext(
          "backend_placeholder",
          "正在等待 Word 文档生成，生成完成后会展示后端导出的真实预览与下载入口。"
        )}
      />
    );

    expect(screen.getByText("后端等待中")).toBeInTheDocument();
    expect(screen.getByText("暂未收到后端真实文档内容")).toBeInTheDocument();
    expect(
      screen.queryByText("以下为前端临时占位/示意内容")
    ).not.toBeInTheDocument();
  });

  it("mindmap preview shows backend placeholder without frontend fake tree", () => {
    render(
      <MindmapPreviewStep
        selectedId="root"
        lastGeneratedAt={null}
        flowContext={buildFlowContext("backend_placeholder")}
        onSelectNode={() => undefined}
      />
    );

    expect(screen.getByText("后端等待中")).toBeInTheDocument();
    expect(screen.getByText("暂未收到后端真实导图")).toBeInTheDocument();
    expect(
      screen.queryByText("以下为前端临时占位/示意内容")
    ).not.toBeInTheDocument();
  });

  it("quiz preview shows backend placeholder without frontend fake questions", () => {
    render(
      <QuizPreviewStep
        lastGeneratedAt={null}
        flowContext={buildFlowContext("backend_placeholder")}
      />
    );

    expect(screen.getByText("后端等待中")).toBeInTheDocument();
    expect(screen.getByText("暂未收到后端真实题目")).toBeInTheDocument();
    expect(
      screen.queryByText("以下为前端临时占位/示意内容")
    ).not.toBeInTheDocument();
  });

  it("game preview shows backend placeholder without frontend sandbox", () => {
    render(
      <GamePreviewStep
        lastGeneratedAt={null}
        flowContext={buildFlowContext("backend_placeholder")}
      />
    );

    expect(screen.getByText("后端等待中")).toBeInTheDocument();
    expect(screen.getByText("暂未收到后端真实游戏")).toBeInTheDocument();
    expect(
      screen.queryByText("以下为前端临时占位/示意内容")
    ).not.toBeInTheDocument();
  });

  it("animation preview shows backend placeholder without frontend demo", () => {
    render(
      <AnimationPreviewStep
        lastGeneratedAt={null}
        flowContext={buildFlowContext("backend_placeholder")}
      />
    );

    expect(screen.getByText("后端等待中")).toBeInTheDocument();
    expect(screen.getByText("暂未收到后端真实动画")).toBeInTheDocument();
    expect(
      screen.queryByText("以下为前端临时占位/示意内容")
    ).not.toBeInTheDocument();
  });

  it("speaker notes preview shows backend placeholder without fake scripts", () => {
    render(
      <SpeakerNotesPreviewStep
        activePage={1}
        lastGeneratedAt={null}
        highlightTransition={false}
        flowContext={buildFlowContext("backend_placeholder")}
        onSelectPage={() => undefined}
      />
    );

    expect(screen.getByText("后端等待中")).toBeInTheDocument();
    expect(screen.getByText("暂未收到后端真实说课讲稿")).toBeInTheDocument();
    expect(
      screen.queryByText("以下为前端临时占位/示意内容")
    ).not.toBeInTheDocument();
  });

  it("simulation preview shows backend placeholder without fake classroom chat", () => {
    render(
      <SimulationPreviewStep
        answer=""
        judgeText=""
        lastGeneratedAt={null}
        flowContext={buildFlowContext("backend_placeholder")}
        onAnswerChange={() => undefined}
        onSubmitAnswer={() => undefined}
      />
    );

    expect(screen.getByText("后端等待中")).toBeInTheDocument();
    expect(screen.getByText("暂未收到后端真实预演内容")).toBeInTheDocument();
    expect(
      screen.queryByText("以下为前端临时占位/示意内容")
    ).not.toBeInTheDocument();
  });
});
