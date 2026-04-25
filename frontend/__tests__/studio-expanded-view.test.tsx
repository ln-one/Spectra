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
  it("renders only the tool workbench for non-ppt cards", () => {
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
        currentCapability={null}
        supportsChatRefine
        requiresSourceArtifact
        hasSourceBinding
        toolFlowContext={buildFlowContext()}
      />
    );

    expect(screen.getByText("mock-tool")).toBeInTheDocument();
    expect(screen.queryByText("教学文档")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "生成正式文档" })
    ).not.toBeInTheDocument();
  });

  it("keeps ppt on the dedicated config panel", () => {
    render(
      <StudioExpandedView
        isExpanded
        expandedTool="ppt"
        expandedToolComponent={MockTool}
        pptResumeStage="config"
        pptResumeSignal={0}
        onPptWorkflowStageChange={() => undefined}
        onPptGenerate={async () => null}
        isCardManagedFlowExpanded
        currentCardId={null}
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
        currentReadiness={null}
        currentCapability={null}
        supportsChatRefine={false}
        requiresSourceArtifact={false}
        hasSourceBinding={false}
        toolFlowContext={buildFlowContext()}
      />
    );

    expect(screen.getByText("mock-generation-config")).toBeInTheDocument();
    expect(screen.queryByText("mock-tool")).not.toBeInTheDocument();
  });
});
