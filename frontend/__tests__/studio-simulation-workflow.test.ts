import { buildArtifactWorkbenchViewModel } from "@/components/project/features/studio/tools/workbenchViewModel";
import type { ToolFlowContext } from "@/components/project/features/studio/tools";

function buildFlowContext(
  overrides: Partial<ToolFlowContext> = {}
): ToolFlowContext {
  return {
    workflowState: "continuing",
    canFollowUpTurn: true,
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
    resolvedArtifact: {
      artifactId: "sim-artifact-1",
      artifactType: "handout",
      contentKind: "json",
      content: {
        summary: "学生会继续追问减速与加速度方向关系。",
      },
    },
    latestArtifacts: [
      {
        artifactId: "sim-artifact-1",
        title: "课堂预演",
        status: "completed",
        createdAt: "2026-04-18T09:00:00.000Z",
      },
    ],
    ...overrides,
  };
}

describe("simulation workflow view model", () => {
  it("prefers follow-up turn guidance once simulator result is available", () => {
    const viewModel = buildArtifactWorkbenchViewModel(
      buildFlowContext(),
      "2026-04-18T09:00:00.000Z",
      "等待后端返回真实课堂预演内容。"
    );

    expect(viewModel.currentSurfaceLabel).toBe("多轮课堂预演工作面");
    expect(viewModel.recommendedAction).toBe("继续追问，推进下一轮课堂预演。");
    expect(viewModel.nextStepSummary).toBe(
      "下一步可继续追问，或回到讲稿和文档调整课堂表达策略。"
    );
  });
});
