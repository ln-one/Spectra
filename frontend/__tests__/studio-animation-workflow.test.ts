import { buildArtifactWorkbenchViewModel } from "@/components/project/features/studio/tools/workbenchViewModel";
import type { ToolFlowContext } from "@/components/project/features/studio/tools";

function buildFlowContext(
  overrides: Partial<ToolFlowContext> = {}
): ToolFlowContext {
  return {
    workflowState: "result_available",
    display: {
      toolId: "animation",
      productTitle: "演示动画",
      productDescription: "围绕正式动画成果、runtime preview 与 placement 展示当前工作面。",
      studioCardId: "demonstration_animations",
      actionLabels: {
        preview: "执行预检",
        loadSources: "刷新来源",
        execute: "开始生成",
        refine: "打开对话微调",
      },
      sourceBinding: {
        required: "必选：请先绑定一个 PPT 成果。",
        optional: "可选：绑定 PPT 后可继续 placement。",
        empty: "当前还没有可绑定成果，点击上方按钮即可刷新。",
      },
    },
    latestArtifacts: [
      {
        artifactId: "anim-artifact-1",
        title: "冒泡排序演示动画",
        status: "completed",
        createdAt: "2026-04-18T09:00:00.000Z",
      },
    ],
    resolvedArtifact: {
      artifactId: "anim-artifact-1",
      artifactType: "mp4",
      contentKind: "json",
      content: {
        kind: "animation_storyboard",
        title: "冒泡排序演示动画",
        summary: "解释比较与交换。",
      },
    },
    ...overrides,
  };
}

describe("animation workflow view model", () => {
  it("keeps mp4 output export-first even if a ppt source is already bound", () => {
    const viewModel = buildArtifactWorkbenchViewModel(
      buildFlowContext({
        selectedSourceId: "ppt-1",
      }),
      "2026-04-18T09:00:00.000Z",
      "等待后端返回真实动画内容。"
    );

    expect(viewModel.recommendedAction).toBe(
      "先导出正式动画；如需 placement，请生成 GIF 成果。"
    );
    expect(viewModel.sourceBindingStatus).toBe(
      "当前已绑定 PPT 来源：ppt-1；如需 placement，请先生成 GIF 版动画。"
    );
    expect(viewModel.nextStepSummary).toBe(
      "下一步可导出正式动画；若要 placement，请生成 GIF 并绑定 PPT。"
    );
  });

  it("exposes placement-first guidance once gif output and ppt binding are both ready", () => {
    const viewModel = buildArtifactWorkbenchViewModel(
      buildFlowContext({
        selectedSourceId: "ppt-1",
        latestRunnableState: { next_action: "placement" },
        resolvedArtifact: {
          artifactId: "anim-artifact-2",
          artifactType: "gif",
          contentKind: "json",
          content: {
            kind: "animation_storyboard",
            title: "受力分析演示动画",
            summary: "展示受力分解过程。",
          },
        },
      }),
      "2026-04-18T09:00:00.000Z",
      "等待后端返回真实动画内容。"
    );

    expect(viewModel.recommendedAction).toBe(
      "当前动画已生成，可先推荐投放位置或直接确认插入 PPT。"
    );
    expect(viewModel.sourceBindingStatus).toBe(
      "当前已绑定 PPT 来源：ppt-1，可继续执行 placement。"
    );
    expect(viewModel.nextStepSummary).toBe(
      "下一步可继续 placement、导出正式动画，或回到讲稿和课件工作流继续组合使用。"
    );
  });
});
