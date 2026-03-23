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
  it("word preview shows backend_not_implemented notice and fallback hint", () => {
    render(
      <WordPreviewStep
        markdown="# 草稿"
        isGenerating={false}
        lastGeneratedAt={null}
        flowContext={buildFlowContext(
          "backend_not_implemented",
          "后端输出为 docx 文件，当前面板为前端草稿预览。"
        )}
        onRegenerate={() => undefined}
      />
    );

    expect(screen.getByText("后端暂未实现")).toBeInTheDocument();
    expect(
      screen.getByText("后端输出为 docx 文件，当前面板为前端草稿预览。")
    ).toBeInTheDocument();
    expect(screen.getByText("以下为前端临时占位/示意内容")).toBeInTheDocument();
  });

  it("mindmap preview shows backend_placeholder notice and fallback hint", () => {
    render(
      <MindmapPreviewStep
        tree={{ id: "root", label: "中心主题", children: [] }}
        selectedId="root"
        selectedNodeLabel="中心主题"
        totalNodeCount={1}
        lastGeneratedAt={null}
        flowContext={buildFlowContext("backend_placeholder")}
        onSelectNode={() => undefined}
        onRegenerate={() => undefined}
        onInjectChildren={() => undefined}
      />
    );

    expect(screen.getByText("后端占位内容")).toBeInTheDocument();
    expect(screen.getByText("以下为前端临时占位/示意内容")).toBeInTheDocument();
  });

  it("quiz preview shows backend_placeholder notice and fallback hint", () => {
    render(
      <QuizPreviewStep
        question={{
          id: "q1",
          question: "以下哪个说法正确？",
          options: ["A", "B", "C", "D"],
          answers: [0],
          explainCorrect: "正确",
          explainWrong: "错误",
        }}
        questionIndex={0}
        totalQuestions={1}
        questionType="single"
        selectedAnswers={[]}
        isSubmitted={false}
        isCorrect={false}
        lastGeneratedAt={null}
        flowContext={buildFlowContext("backend_placeholder")}
        onRegenerate={() => undefined}
        onToggleOption={() => undefined}
        onSubmitAnswer={() => undefined}
        onNextQuestion={() => undefined}
        onResetCurrent={() => undefined}
      />
    );

    expect(screen.getByText("后端占位内容")).toBeInTheDocument();
    expect(screen.getByText("以下为前端临时占位/示意内容")).toBeInTheDocument();
  });

  it("game preview shows backend_placeholder notice and fallback hint", () => {
    render(
      <GamePreviewStep
        sandboxTitle="小游戏"
        sandboxDescription="说明"
        pseudoCode="console.log('game')"
        countdown={30}
        life={3}
        lastGeneratedAt={null}
        flowContext={buildFlowContext("backend_placeholder")}
        onRegenerate={() => undefined}
        onActionPenalty={() => undefined}
        onActionReward={() => undefined}
      />
    );

    expect(screen.getByText("后端占位内容")).toBeInTheDocument();
    expect(screen.getByText("以下为前端临时占位/示意内容")).toBeInTheDocument();
  });

  it("animation preview shows backend_placeholder notice and fallback hint", () => {
    render(
      <AnimationPreviewStep
        codeText="animation code"
        description="动画描述"
        speed={50}
        showTrail={true}
        splitView={true}
        lineColor="#ff0000"
        lastGeneratedAt={null}
        flowContext={buildFlowContext("backend_placeholder")}
        onRegenerate={() => undefined}
        onSpeedChange={() => undefined}
        onShowTrailChange={() => undefined}
        onSplitViewChange={() => undefined}
        onLineColorChange={() => undefined}
        onQuickHalfSpeed={() => undefined}
        onQuickRedTrail={() => undefined}
      />
    );

    expect(screen.getByText("后端占位内容")).toBeInTheDocument();
    expect(screen.getByText("以下为前端临时占位/示意内容")).toBeInTheDocument();
  });

  it("speaker notes preview shows backend_not_implemented notice and fallback hint", () => {
    render(
      <SpeakerNotesPreviewStep
        scripts={[
          {
            page: 1,
            title: "标题",
            script: "讲稿内容",
          },
        ]}
        activePage={1}
        lastGeneratedAt={null}
        highlightTransition={false}
        flowContext={buildFlowContext("backend_not_implemented")}
        onRegenerate={() => undefined}
        onSelectPage={() => undefined}
        onToggleHighlight={() => undefined}
      />
    );

    expect(screen.getByText("后端暂未实现")).toBeInTheDocument();
    expect(screen.getByText("以下为前端临时占位/示意内容")).toBeInTheDocument();
  });

  it("simulation preview shows backend_not_implemented notice and fallback hint", () => {
    render(
      <SimulationPreviewStep
        students={[
          {
            id: "s1",
            name: "学生甲",
            tag: "积极",
            profile: "divergent_top",
          },
        ]}
        question={null}
        answer=""
        judgeText=""
        includeStrategyPanel={false}
        strategyOffset={0}
        lastGeneratedAt={null}
        flowContext={buildFlowContext("backend_not_implemented")}
        onRegenerate={() => undefined}
        onAnswerChange={() => undefined}
        onSubmitAnswer={() => undefined}
        onNextRound={() => undefined}
        onOpenStrategies={() => undefined}
      />
    );

    expect(screen.getByText("后端暂未实现")).toBeInTheDocument();
    expect(screen.getByText("以下为前端临时占位/示意内容")).toBeInTheDocument();
  });
});
