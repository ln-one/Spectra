import { render, screen } from "@testing-library/react";
import { StudioExpandedView } from "@/components/project/features/studio/panel/components/StudioExpandedView";
import type { ToolFlowContext } from "@/components/project/features/studio/tools";

jest.mock("@/components/project", () => ({
  GenerationConfigPanel: () => <div>mock-generation-config</div>,
}));

function MockTool() {
  return <div>mock-tool</div>;
}

function buildFlowContext(overrides: Partial<ToolFlowContext> = {}): ToolFlowContext {
  return {
    display: {
      toolId: "word",
      productTitle: "教学文档",
      productDescription: "围绕已生成成果延展正式文档。",
      studioCardId: "word_document",
      actionLabels: {
        preview: "执行预检",
        loadSources: "刷新来源",
        execute: "生成正式文档",
        refine: "打开对话微调",
      },
      sourceBinding: {
        required: "必选：请绑定一个 PPT 成果作为文档来源。",
        optional: "可选：绑定已有成果后，文档内容会更贴近当前项目上下文。",
        empty: "当前还没有可绑定成果，点击上方按钮即可刷新。",
      },
    },
    workflowState: "result_available",
    ...overrides,
  };
}

describe("StudioExpandedView", () => {
  it("renders unified capability bar for managed studio cards", () => {
    render(
      <StudioExpandedView
        isExpanded
        expandedTool="word"
        expandedToolComponent={MockTool}
        pptResumeStage="config"
        pptResumeSignal={0}
        onPptWorkflowStageChange={() => undefined}
        onPptGenerate={async () => null}
        isCardManagedFlowExpanded
        currentCardId="word_document"
        isStudioActionRunning={false}
        isLoadingCardProtocol={false}
        sourceOptions={[{ id: "artifact-1", title: "第一版课件", type: "ppt" }]}
        selectedSourceId="artifact-1"
        onSelectedSourceChange={() => undefined}
        canRefine
        canExecute
        onOpenChatRefine={() => undefined}
        onPreviewExecution={() => undefined}
        onLoadSources={() => undefined}
        onExecute={() => undefined}
        currentReadiness="foundation_ready"
        currentCapability={{
          id: "word_document",
          title: "Word Document",
          readiness: "foundation_ready",
          context_mode: "artifact",
          execution_mode: "artifact_create",
          requires_source_artifact: true,
          supports_chat_refine: true,
          supports_selection_context: false,
          actions: [{ type: "execute", label: "生成 Word" }],
        }}
        supportsChatRefine
        requiresSourceArtifact
        hasSourceBinding
        toolFlowContext={buildFlowContext()}
      />
    );

    expect(screen.getByText("教学文档")).toBeInTheDocument();
    expect(screen.getByText("围绕已生成成果延展正式文档。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "执行预检" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新来源" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开对话微调" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成正式文档" })).toBeInTheDocument();
    expect(screen.getByText("第一版课件 (ppt)")).toBeInTheDocument();
    expect(screen.getByText("流程：结果可用")).toBeInTheDocument();
  });

  it("shows source and protocol warnings with unified copy", () => {
    render(
      <StudioExpandedView
        isExpanded
        expandedTool="handout"
        expandedToolComponent={MockTool}
        pptResumeStage="config"
        pptResumeSignal={0}
        onPptWorkflowStageChange={() => undefined}
        onPptGenerate={async () => null}
        isCardManagedFlowExpanded
        currentCardId="classroom_qa_simulator"
        isStudioActionRunning={false}
        isLoadingCardProtocol={false}
        sourceOptions={[]}
        selectedSourceId={null}
        onSelectedSourceChange={() => undefined}
        canRefine={false}
        canExecute={false}
        onOpenChatRefine={() => undefined}
        onPreviewExecution={() => undefined}
        onLoadSources={() => undefined}
        onExecute={() => undefined}
        currentReadiness="protocol_pending"
        currentCapability={{
          id: "classroom_qa_simulator",
          title: "Classroom Simulator",
          readiness: "protocol_pending",
          context_mode: "artifact",
          execution_mode: "composite",
          requires_source_artifact: true,
          supports_chat_refine: false,
          supports_selection_context: false,
          actions: [],
        }}
        supportsChatRefine={false}
        requiresSourceArtifact
        hasSourceBinding={false}
        toolFlowContext={buildFlowContext({
          display: {
            toolId: "handout",
            productTitle: "学情预演",
            productDescription: "围绕真实课堂预演结果统一展示当前轮焦点。",
            studioCardId: "classroom_qa_simulator",
            actionLabels: {
              preview: "执行预检",
              loadSources: "刷新来源",
              execute: "开始课堂预演",
              refine: "调整追问方向",
            },
            sourceBinding: {
              required: "必选：请先绑定一个来源成果。",
              optional: "可选：绑定已有成果后，预演提问会更贴近当前项目上下文。",
              empty: "当前还没有可绑定成果，点击上方按钮即可刷新。",
            },
          },
          isProtocolPending: true,
          workflowState: "continuing",
        })}
      />
    );

    expect(screen.getByText("当前还没有可绑定成果，点击上方按钮即可刷新。")).toBeInTheDocument();
    expect(screen.getByText("必选：请先绑定一个来源成果。")).toBeInTheDocument();
    expect(screen.getByText("当前卡片协议尚未补齐，执行与微调暂不可用。")).toBeInTheDocument();
    expect(screen.getByText("流程：续轮中")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始课堂预演" })).toBeDisabled();
  });

  it("does not expose chat refine action when formal capability is not available", () => {
    render(
      <StudioExpandedView
        isExpanded
        expandedTool="outline"
        expandedToolComponent={MockTool}
        pptResumeStage="config"
        pptResumeSignal={0}
        onPptWorkflowStageChange={() => undefined}
        onPptGenerate={async () => null}
        isCardManagedFlowExpanded
        currentCardId="interactive_games"
        isStudioActionRunning={false}
        isLoadingCardProtocol={false}
        sourceOptions={[]}
        selectedSourceId={null}
        onSelectedSourceChange={() => undefined}
        canRefine={false}
        canExecute
        onOpenChatRefine={() => undefined}
        onPreviewExecution={() => undefined}
        onLoadSources={() => undefined}
        onExecute={() => undefined}
        currentReadiness="foundation_ready"
        currentCapability={{
          id: "interactive_games",
          title: "Interactive Games",
          readiness: "foundation_ready",
          context_mode: "artifact",
          execution_mode: "artifact_create",
          requires_source_artifact: false,
          supports_chat_refine: false,
          supports_selection_context: false,
          actions: [{ type: "structured_refine", label: "提交正式 Rewrite" }],
          governance_tag: "freeze",
          cleanup_priority: "p0",
          surface_strategy: "freeze_then_runtime_replacement",
          frozen: true,
        }}
        supportsChatRefine={false}
        requiresSourceArtifact={false}
        hasSourceBinding={false}
        toolFlowContext={buildFlowContext({
          display: {
            toolId: "outline",
            productTitle: "互动游戏",
            productDescription: "通过真实 HTML artifact 统一展示当前玩法。",
            studioCardId: "interactive_games",
            actionLabels: {
              preview: "执行预检",
              loadSources: "刷新来源",
              execute: "生成游戏原型",
              refine: "打开对话微调",
            },
            sourceBinding: {
              required: "必选：请先绑定一个来源成果。",
              optional: "可选：绑定已有成果后，游戏内容会更贴近当前项目上下文。",
              empty: "当前还没有可绑定成果，点击上方按钮即可刷新。",
            },
          },
        })}
      />
    );

    expect(
      screen.queryByRole("button", { name: "打开对话微调" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成游戏原型" })).toBeInTheDocument();
  });

  it("shows harden governance copy for simulator cards", () => {
    render(
      <StudioExpandedView
        isExpanded
        expandedTool="handout"
        expandedToolComponent={MockTool}
        pptResumeStage="config"
        pptResumeSignal={0}
        onPptWorkflowStageChange={() => undefined}
        onPptGenerate={async () => null}
        isCardManagedFlowExpanded
        currentCardId="classroom_qa_simulator"
        isStudioActionRunning={false}
        isLoadingCardProtocol={false}
        sourceOptions={[]}
        selectedSourceId={null}
        onSelectedSourceChange={() => undefined}
        canRefine
        canExecute
        onOpenChatRefine={() => undefined}
        onPreviewExecution={() => undefined}
        onLoadSources={() => undefined}
        onExecute={() => undefined}
        currentReadiness="foundation_ready"
        currentCapability={{
          id: "classroom_qa_simulator",
          title: "Classroom Simulator",
          readiness: "foundation_ready",
          context_mode: "hybrid",
          execution_mode: "composite",
          requires_source_artifact: false,
          supports_chat_refine: true,
          supports_selection_context: false,
          governance_tag: "harden",
          cleanup_priority: "p2",
          surface_strategy: "turn_based_simulation_shell",
          actions: [{ type: "follow_up_turn", label: "继续追问" }],
        }}
        supportsChatRefine
        requiresSourceArtifact={false}
        hasSourceBinding={false}
        toolFlowContext={buildFlowContext({
          display: {
            toolId: "handout",
            productTitle: "学情预演",
            productDescription: "围绕真实课堂预演结果统一展示当前轮焦点。",
            studioCardId: "classroom_qa_simulator",
            actionLabels: {
              preview: "执行预检",
              loadSources: "刷新来源",
              execute: "开始课堂预演",
              refine: "调整追问方向",
            },
            sourceBinding: {
              required: "必选：请先绑定一个来源成果。",
              optional: "可选：绑定已有成果后，预演提问会更贴近当前项目上下文。",
              empty: "当前还没有可绑定成果，点击上方按钮即可刷新。",
            },
          },
        })}
      />
    );

    expect(screen.getByText("治理：加固")).toBeInTheDocument();
    expect(screen.getByText("清理优先级：P2")).toBeInTheDocument();
  });

  it("shows separate-track governance copy for animation cards", () => {
    render(
      <StudioExpandedView
        isExpanded
        expandedTool="animation"
        expandedToolComponent={MockTool}
        pptResumeStage="config"
        pptResumeSignal={0}
        onPptWorkflowStageChange={() => undefined}
        onPptGenerate={async () => null}
        isCardManagedFlowExpanded
        currentCardId="demonstration_animations"
        isStudioActionRunning={false}
        isLoadingCardProtocol={false}
        sourceOptions={[]}
        selectedSourceId={null}
        onSelectedSourceChange={() => undefined}
        canRefine
        canExecute
        onOpenChatRefine={() => undefined}
        onPreviewExecution={() => undefined}
        onLoadSources={() => undefined}
        onExecute={() => undefined}
        currentReadiness="foundation_ready"
        currentCapability={{
          id: "demonstration_animations",
          title: "Demonstration Animations",
          readiness: "foundation_ready",
          context_mode: "artifact",
          execution_mode: "artifact_create",
          requires_source_artifact: false,
          supports_chat_refine: true,
          supports_selection_context: true,
          governance_tag: "separate-track",
          cleanup_priority: "p1",
          surface_strategy: "separate_runtime_track",
          actions: [{ type: "structured_refine", label: "按规格生成新版" }],
        }}
        supportsChatRefine
        requiresSourceArtifact={false}
        hasSourceBinding={false}
        toolFlowContext={buildFlowContext({
          display: {
            toolId: "animation",
            productTitle: "演示动画",
            productDescription: "围绕 storyboard artifact 展示正式结果与 placement。",
            studioCardId: "demonstration_animations",
            actionLabels: {
              preview: "执行预检",
              loadSources: "刷新来源",
              execute: "生成动画",
              refine: "讨论动画策略",
            },
            sourceBinding: {
              required: "必选：请先绑定一个来源成果。",
              optional: "动画生成本身不依赖 PPT；如需 placement，可稍后绑定。",
              empty: "当前还没有可绑定成果，点击上方按钮即可刷新。",
            },
          },
        })}
      />
    );

    expect(screen.getByText("治理：独立轨道")).toBeInTheDocument();
    expect(screen.getByText("清理优先级：P1")).toBeInTheDocument();
  });

  it("shows defer governance copy for quiz cards", () => {
    render(
      <StudioExpandedView
        isExpanded
        expandedTool="quiz"
        expandedToolComponent={MockTool}
        pptResumeStage="config"
        pptResumeSignal={0}
        onPptWorkflowStageChange={() => undefined}
        onPptGenerate={async () => null}
        isCardManagedFlowExpanded
        currentCardId="interactive_quick_quiz"
        isStudioActionRunning={false}
        isLoadingCardProtocol={false}
        sourceOptions={[]}
        selectedSourceId={null}
        onSelectedSourceChange={() => undefined}
        canRefine
        canExecute
        onOpenChatRefine={() => undefined}
        onPreviewExecution={() => undefined}
        onLoadSources={() => undefined}
        onExecute={() => undefined}
        currentReadiness="foundation_ready"
        currentCapability={{
          id: "interactive_quick_quiz",
          title: "Interactive Quick Quiz",
          readiness: "foundation_ready",
          context_mode: "artifact",
          execution_mode: "artifact_create",
          requires_source_artifact: false,
          supports_chat_refine: true,
          supports_selection_context: true,
          governance_tag: "defer",
          cleanup_priority: "p2",
          surface_strategy: "thin_builder_then_assessment_runtime",
          actions: [{ type: "chat_refine", label: "打开对话微调" }],
        }}
        supportsChatRefine
        requiresSourceArtifact={false}
        hasSourceBinding={false}
        toolFlowContext={buildFlowContext({
          display: {
            toolId: "quiz",
            productTitle: "随堂小测",
            productDescription: "围绕真实题目统一展示当前题目工作面。",
            studioCardId: "interactive_quick_quiz",
            actionLabels: {
              preview: "执行预检",
              loadSources: "刷新来源",
              execute: "生成题目",
              refine: "打开对话微调",
            },
            sourceBinding: {
              required: "必选：请先绑定一个来源成果。",
              optional: "可选：绑定已有成果后，题目会更贴近当前项目上下文。",
              empty: "当前还没有可绑定成果，点击上方按钮即可刷新。",
            },
          },
        })}
      />
    );

    expect(screen.getByText("治理：延后")).toBeInTheDocument();
    expect(screen.getByText("清理优先级：P2")).toBeInTheDocument();
  });
});
