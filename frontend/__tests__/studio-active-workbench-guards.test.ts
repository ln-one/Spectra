import { buildArtifactWorkbenchViewModel } from "@/components/project/features/studio/tools/workbenchViewModel";
import type { ToolFlowContext } from "@/components/project/features/studio/tools";

function buildWordContext(
  overrides: Partial<ToolFlowContext> = {}
): ToolFlowContext {
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
    requiresSourceArtifact: true,
    ...overrides,
  };
}

describe("studio active workbench guards", () => {
  it("keeps word shared source binding copy aligned when source is required but missing", () => {
    const viewModel = buildArtifactWorkbenchViewModel(
      buildWordContext(),
      null,
      "等待后端返回真实文档内容。"
    );

    expect(viewModel.sourceBindingStatus).toBe("当前需要先绑定来源成果。");
    expect(viewModel.recommendedAction).toBe("继续微调文档，或导出正式产物。");
  });

  it("uses answer_or_refine guidance for quiz workbench when runtime state requests it", () => {
    const viewModel = buildArtifactWorkbenchViewModel(
      {
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
        latestRunnableState: { next_action: "answer_or_refine" },
      },
      "2026-04-18T09:00:00.000Z",
      "等待后端返回真实题目内容。"
    );

    expect(viewModel.recommendedAction).toBe("先答题，或继续微调当前题。");
    expect(viewModel.nextStepSummary).toBe(
      "下一步可继续微调当前题，或带着题目重点进入课堂预演。"
    );
  });

  it("keeps mindmap shared guidance selection-first instead of chat-first", () => {
    const viewModel = buildArtifactWorkbenchViewModel(
      {
        display: {
          toolId: "mindmap",
          productTitle: "知识导图",
          productDescription: "围绕真实导图结构统一展示编辑工作面。",
          studioCardId: "knowledge_mindmap",
          actionLabels: {
            preview: "执行预检",
            loadSources: "刷新来源",
            execute: "生成导图",
            refine: "打开对话微调",
          },
          sourceBinding: {
            required: "必选：请先绑定一个来源成果。",
            optional: "可选：绑定已有成果后，导图会更贴近当前项目上下文。",
            empty: "当前还没有可绑定成果，点击上方按钮即可刷新。",
          },
        },
      },
      "2026-04-18T09:00:00.000Z",
      "等待后端返回真实导图内容。"
    );

    expect(viewModel.recommendedAction).toBe("选择节点后继续结构化编辑。");
    expect(viewModel.nextStepSummary).toBe(
      "下一步可继续扩展节点，或带着知识结构进入课堂预演。"
    );
  });
});
