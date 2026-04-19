import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ToolFlowContext } from "@/components/project/features/studio/tools";
import { PreviewStep } from "@/components/project/features/studio/tools/word/PreviewStep";
import { GenerateStep } from "@/components/project/features/studio/tools/word/GenerateStep";

function buildFlowContext(overrides: Partial<ToolFlowContext> = {}): ToolFlowContext {
  return {
    display: {
      toolId: "word",
      productTitle: "教案",
      productDescription: "围绕统一 Sources 生成、编辑并沉淀教案成果。",
      studioCardId: "word_document",
      actionLabels: {
        preview: "执行预检",
        loadSources: "刷新来源",
        execute: "生成教案",
        refine: "打开对话微调",
      },
      sourceBinding: {
        required: "必选：请绑定一个 PPT 成果作为文档来源。",
        optional: "可选：绑定已有成果后，文档内容会更贴近当前项目上下文。",
        empty: "当前还没有可绑定成果，点击上方按钮即可刷新。",
      },
    },
    cardCapability: {
      id: "word_document",
      title: "教案工作台",
      readiness: "foundation_ready",
      governance_tag: "borrow",
      cleanup_priority: "p1",
      surface_strategy: "document_surface_adapter",
      frozen: false,
      health_report: {
        authority_integrity: 3,
        builder_thinness: 2,
        surface_maturity: 2,
        fallback_residue: 2,
        test_coverage: 3,
        replaceability: 5,
        summary:
          "优先借成熟文档编辑 substrate，停止继续把 word_template_engine 长成第二文档系统。",
      },
      context_mode: "hybrid",
      execution_mode: "artifact_create",
      primary_capabilities: [],
      related_capabilities: [],
      artifact_types: [],
      requires_source_artifact: true,
      supports_chat_refine: true,
      supports_selection_context: false,
      config_fields: [],
      actions: [],
    },
    ...overrides,
  };
}

describe("studio word card", () => {
  it("disables generation when required source artifact is missing", () => {
    render(
      <GenerateStep
        topic="牛顿第二定律"
        goal="形成受力分析与加速度关系的完整理解"
        teachingContext=""
        studentNeeds=""
        outputRequirements=""
        detailLevel="standard"
        gradeBand="high"
        flowContext={buildFlowContext({
          requiresSourceArtifact: true,
          selectedSourceId: null,
          sourceOptions: [],
        })}
        isGenerating={false}
        onBack={() => undefined}
        onGenerate={() => undefined}
      />
    );

    expect(
      screen.getByText("当前教案主链要求先在右侧资料来源中选中一个课件来源。")
    ).toBeInTheDocument();
    expect(
      screen.getByText("请先在右侧 Sources 中选中一个 PPT Source，再生成教案。")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成教案" })).toBeDisabled();
  });

  it("shows source binding, download and chat refine actions for real artifacts", async () => {
    const onRefine = jest.fn();
    const onExportArtifact = jest.fn();
    const onStructuredRefineArtifact = jest.fn().mockResolvedValue({ ok: true });

    render(
      <PreviewStep
        markdown="# 教学文档"
        isGenerating={false}
        lastGeneratedAt={"2026-04-17T08:00:00.000Z"}
        flowContext={buildFlowContext({
          capabilityStatus: "backend_ready",
          capabilityReason: "Loaded backend Word document.",
          supportsChatRefine: true,
          onRefine,
          onExportArtifact,
          onStructuredRefineArtifact,
          resolvedArtifact: {
            artifactId: "word-artifact-1",
            artifactType: "docx",
            contentKind: "json",
            content: {
              kind: "teaching_document",
              schema_id: "lesson_plan_v1",
              title: "牛顿第二定律教案",
              summary: "已更新文档内容。",
              document_content: {
                type: "doc",
                content: [
                  {
                    type: "heading",
                    attrs: { level: 2 },
                    content: [{ type: "text", text: "教学目标" }],
                  },
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "理解牛顿第二定律的核心关系。" }],
                  },
                ],
              },
              source_snapshot: {
                primary_source_id: "ppt-artifact-1",
                primary_source_title: "牛顿第二定律课件",
              },
              source_artifact_id: "ppt-artifact-1",
              source_binding: { status: "bound" },
            },
          },
          selectedSourceId: "ppt-artifact-1",
          sourceOptions: [{ id: "ppt-artifact-1", title: "牛顿第二定律课件", type: "ppt" }],
          latestArtifacts: [
            {
              artifactId: "word-artifact-1",
              title: "牛顿第二定律教案",
              status: "completed",
              createdAt: "2026-04-17T08:00:00.000Z",
              sourceArtifactId: "ppt-artifact-1",
            },
          ],
        })}
      />
    );

    expect(screen.getByText("当前建议动作：继续微调教案，或导出正式产物。")).toBeInTheDocument();
    expect(screen.getByText("治理：借底座 · 清理优先级：P1")).toBeInTheDocument();
    expect(screen.getByText("牛顿第二定律教案")).toBeInTheDocument();
    expect(screen.getAllByText("教案工作台").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("已绑定来源成果：牛顿第二定律课件")).toBeInTheDocument();
    expect(screen.getByText("从 牛顿第二定律课件 延展为教案")).toBeInTheDocument();
    expect(screen.getByText("Lesson Plan")).toBeInTheDocument();
    expect(
      screen.getByText("下一步可继续导出教案，或回到讲稿与课堂预演继续打磨表达。")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "编辑文档" }));
    expect(screen.getByText("结构化区块")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "标题" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "项目符号" })).toBeInTheDocument();
    expect(screen.getByText("标题 · block-1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "保存为新版本" }));
    await waitFor(() => {
      expect(onStructuredRefineArtifact).toHaveBeenCalledWith(
        expect.objectContaining({
          artifactId: "word-artifact-1",
          refineMode: "structured_refine",
          config: expect.objectContaining({
            document_title: "牛顿第二定律教案",
            document_summary: "已更新文档内容。",
            schema_id: "lesson_plan_v1",
          }),
        })
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "打开对话微调" }));
    fireEvent.click(screen.getByRole("button", { name: "导出教案文档" }));
    expect(onRefine).toHaveBeenCalledTimes(1);
    expect(onExportArtifact).toHaveBeenCalledWith("word-artifact-1");
  });
});
