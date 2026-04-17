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
        })}
      />
    );

    expect(screen.getByText("当前还没有可绑定成果，点击上方按钮即可刷新。")).toBeInTheDocument();
    expect(screen.getByText("必选：请先绑定一个来源成果。")).toBeInTheDocument();
    expect(screen.getByText("当前卡片协议尚未补齐，执行与微调暂不可用。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始课堂预演" })).toBeDisabled();
  });
});
