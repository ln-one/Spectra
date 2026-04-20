import { render, screen } from "@testing-library/react";
import { QuizToolPanel } from "@/components/project/features/studio/tools/QuizToolPanel";
import { MindmapToolPanel } from "@/components/project/features/studio/tools/MindmapToolPanel";
import { SpeakerNotesToolPanel } from "@/components/project/features/studio/tools/SpeakerNotesToolPanel";
import { SimulationToolPanel } from "@/components/project/features/studio/tools/SimulationToolPanel";
import type { ToolFlowContext } from "@/components/project/features/studio/tools";

jest.mock("@/components/project/features/studio/constants", () => ({
  TOOL_COLORS: {
    summary: { primary: "#0ea5e9", glow: "#e0f2fe", soft: "#f0f9ff", gradient: "from-sky-400 to-cyan-500" },
    quiz: { primary: "#10b981", glow: "#d1fae5", soft: "#ecfdf5", gradient: "from-emerald-400 to-teal-500" },
    mindmap: { primary: "#8b5cf6", glow: "#ede9fe", soft: "#f5f3ff", gradient: "from-violet-400 to-purple-500" },
    handout: { primary: "#f59e0b", glow: "#fef3c7", soft: "#fffbeb", gradient: "from-amber-400 to-orange-500" },
  },
}));

jest.mock("@/components/project/shared", () => ({
  WorkflowStepper: ({ title }: { title?: string }) => <div>{title ?? "workflow-stepper"}</div>,
}));

jest.mock("@/components/project/features/studio/tools/useStudioRagRecommendations", () => ({
  useStudioRagRecommendations: () => ({
    suggestions: ["牛顿第二定律"],
    summary: "突出核心概念与常见误区。",
    isLoading: false,
  }),
}));

jest.mock("@/components/project/features/studio/tools/useWorkflowStepSync", () => ({
  useWorkflowStepSync: () => undefined,
}));

jest.mock("@/stores/projectStore", () => ({
  useProjectStore: (selector: (state: unknown) => unknown) =>
    selector({
      project: null,
      files: [],
      selectedFileIds: [],
    }),
}));

function buildFlowContext(overrides: Partial<ToolFlowContext> = {}): ToolFlowContext {
  return {
    readiness: "foundation_ready",
    workflowState: "continuing",
    selectedSourceId: null,
    sourceOptions: [],
    ...overrides,
  };
}

describe("studio panel workflow guards", () => {
  it("does not expose speaker notes local machine state in the header", () => {
    render(
      <SpeakerNotesToolPanel
        toolId="summary"
        toolName="说课讲稿"
        flowContext={buildFlowContext()}
      />
    );

    expect(screen.getByText("说课讲稿智能工作台")).toBeInTheDocument();
    expect(screen.queryByText("idle")).not.toBeInTheDocument();
    expect(screen.queryByText("preview_ready")).not.toBeInTheDocument();
  });

  it("does not expose quiz local machine state in the header", () => {
    render(
      <QuizToolPanel
        toolId="quiz"
        toolName="随堂小测"
        flowContext={buildFlowContext()}
      />
    );

    expect(screen.getByText("随堂小测智能工作台")).toBeInTheDocument();
    expect(screen.queryByText("idle")).not.toBeInTheDocument();
    expect(screen.queryByText("result_available")).not.toBeInTheDocument();
  });

  it("does not expose mindmap local machine state in the header", () => {
    render(
      <MindmapToolPanel
        toolId="mindmap"
        toolName="知识导图"
        flowContext={buildFlowContext()}
      />
    );

    expect(screen.getByText("生成要求")).toBeInTheDocument();
    expect(screen.queryByText("idle")).not.toBeInTheDocument();
    expect(screen.queryByText("preview_ready")).not.toBeInTheDocument();
  });

  it("does not duplicate shared workflow state in the simulation panel header", () => {
    render(
      <SimulationToolPanel
        toolId="handout"
        toolName="学情预演"
        flowContext={buildFlowContext({ workflowState: "continuing" })}
      />
    );

    expect(screen.getByText("学情预演智能工作台")).toBeInTheDocument();
    expect(screen.queryByText("continuing")).not.toBeInTheDocument();
  });
});
