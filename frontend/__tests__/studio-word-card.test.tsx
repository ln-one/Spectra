import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ToolFlowContext } from "@/components/project/features/studio/tools";
import { PreviewStep } from "@/components/project/features/studio/tools/word/PreviewStep";
import { WordToolPanel } from "@/components/project/features/studio/tools/WordToolPanel";

jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

jest.mock("remark-gfm", () => ({
  __esModule: true,
  default: () => undefined,
}));

jest.mock("rehype-sanitize", () => ({
  __esModule: true,
  default: () => undefined,
}));

const exportSessionPreviewMock = jest.fn();

jest.mock("@/lib/sdk", () => ({
  previewApi: {
    exportSessionPreview: (...args: unknown[]) => exportSessionPreviewMock(...args),
  },
}));

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
      requires_source_artifact: false,
      supports_chat_refine: true,
      supports_selection_context: false,
      config_fields: [],
      actions: [],
    },
    ...overrides,
  };
}

describe("studio word card", () => {
  beforeEach(() => {
    exportSessionPreviewMock.mockReset();
    exportSessionPreviewMock.mockResolvedValue({
      data: { content: "# 教案预览" },
    });
  });

  it("keeps the lesson plan workbench minimal and only needs a topic when no source is selected", () => {
    render(
      <WordToolPanel
        toolName="教案"
        flowContext={buildFlowContext({
          requiresSourceArtifact: false,
          selectedSourceId: null,
          sourceOptions: [],
        })}
      />
    );

    expect(
      screen.getByText("未选课件：将按课题与资料来源生成")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("课题")).toBeInTheDocument();
    expect(screen.getByLabelText("补充要求")).toBeInTheDocument();
    expect(screen.queryByText("详细程度")).not.toBeInTheDocument();
    expect(screen.queryByText("适用学段")).not.toBeInTheDocument();
    expect(screen.queryByText("学习目标")).not.toBeInTheDocument();
    expect(screen.queryByText("教学场景与约束")).not.toBeInTheDocument();
    expect(screen.queryByText("学生画像与难点")).not.toBeInTheDocument();
    expect(screen.queryByText("输出要求")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "生成教案" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("课题"), {
      target: { value: "物理层的基本概念" },
    });
    expect(screen.getByLabelText("课题")).toHaveValue("物理层的基本概念");
  });

  it("allows users to clear auto-filled topic and requirements", () => {
    render(
      <WordToolPanel
        toolName="教案"
        flowContext={buildFlowContext({
          requiresSourceArtifact: true,
          selectedSourceId: "ppt-artifact-1",
          sourceOptions: [
            { id: "ppt-artifact-1", title: "牛顿第二定律课件", type: "ppt" },
          ],
        })}
      />
    );

    const topicInput = screen.getByLabelText("课题");
    fireEvent.change(topicInput, { target: { value: "牛顿第二定律" } });
    fireEvent.click(screen.getByRole("button", { name: "清空课题" }));
    expect(topicInput).toHaveValue("");

    const requirementsInput = screen.getByLabelText("补充要求");
    fireEvent.change(requirementsInput, {
      target: { value: "突出评价任务" },
    });
    fireEvent.click(screen.getByRole("button", { name: "清空补充要求" }));
    expect(requirementsInput).toHaveValue("");
  });

  it("updates draft payload directly from topic input when no PPT source is selected", async () => {
    const onDraftChange = jest.fn();

    render(
      <WordToolPanel
        toolName="教案"
        onDraftChange={onDraftChange}
        flowContext={buildFlowContext({
          requiresSourceArtifact: false,
          selectedSourceId: null,
          sourceOptions: [],
        })}
      />
    );

    fireEvent.change(screen.getByLabelText("课题"), {
      target: { value: "物理层的基本概念" },
    });
    fireEvent.change(screen.getByLabelText("补充要求"), {
      target: { value: "补充学情分析，突出重难点突破" },
    });

    await waitFor(() => {
      expect(onDraftChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          kind: "teaching_document",
          schema_id: "lesson_plan_v1",
          topic: "物理层的基本概念",
          output_requirements: "补充学情分析，突出重难点突破",
          primary_source_id: null,
          source_artifact_id: null,
        })
      );
    });
  });

  it("keeps source-aware draft payload when a source is selected", async () => {
    const onDraftChange = jest.fn();

    render(
      <WordToolPanel
        toolName="教案"
        onDraftChange={onDraftChange}
        flowContext={buildFlowContext({
          requiresSourceArtifact: true,
          selectedSourceId: "ppt-artifact-1",
          sourceOptions: [
            { id: "ppt-artifact-1", title: "牛顿第二定律课件", type: "ppt" },
          ],
        })}
      />
    );

    expect(screen.getByText("已选择：牛顿第二定律课件")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("课题"), {
      target: { value: "牛顿第二定律" },
    });
    fireEvent.change(screen.getByLabelText("补充要求"), {
      target: { value: "突出评价任务，加入课堂活动" },
    });

    await waitFor(() => {
      expect(onDraftChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          kind: "teaching_document",
          schema_id: "lesson_plan_v1",
          topic: "牛顿第二定律",
          output_requirements: "突出评价任务，加入课堂活动",
          detail_level: "standard",
          primary_source_id: "ppt-artifact-1",
        })
      );
    });
  });

  it("keeps the top-level word entry in new-draft mode even if an old result exists", () => {
    render(
      <WordToolPanel
        toolName="教案"
        flowContext={buildFlowContext({
          wordWorkbenchMode: "draft",
          capabilityStatus: "backend_ready",
          resolvedArtifact: {
            artifactId: "word-artifact-1",
            artifactType: "docx",
            contentKind: "json",
            content: {
              kind: "teaching_document",
              title: "旧教案",
            },
          },
          latestArtifacts: [
            {
              artifactId: "word-artifact-1",
              title: "旧教案",
              status: "completed",
              createdAt: "2026-04-17T08:00:00.000Z",
            },
          ],
        })}
      />
    );

    expect(screen.getByLabelText("课题")).toBeInTheDocument();
    expect(screen.queryByText("旧教案")).not.toBeInTheDocument();
    expect(screen.queryByText("编辑文档")).not.toBeInTheDocument();
  });

  it("restores the saved lesson-plan draft instead of being overwritten by recommendations", () => {
    render(
      <WordToolPanel
        toolName="教案"
        flowContext={buildFlowContext({
          currentDraft: {
            kind: "teaching_document",
            topic: "低轨道卫星系统",
            output_requirements: "突出重难点突破",
          },
        })}
      />
    );

    expect(screen.getByLabelText("课题")).toHaveValue("低轨道卫星系统");
    expect(screen.getByLabelText("补充要求")).toHaveValue("突出重难点突破");
    expect(screen.queryByDisplayValue("jpg")).not.toBeInTheDocument();
  });

  it("loads history preview with the history result session instead of the active session", async () => {
    render(
      <WordToolPanel
        toolName="教案"
        flowContext={buildFlowContext({
          wordWorkbenchMode: "history",
          wordResultTarget: {
            sessionId: "sess-history",
            artifactId: "word-artifact-1",
          },
          capabilityStatus: "backend_ready",
          latestArtifacts: [
            {
              artifactId: "word-artifact-1",
              title: "计算机网络：物理层教案",
              status: "completed",
              createdAt: "2026-04-19T15:45:00.000Z",
            },
          ],
        })}
      />
    );

    await waitFor(() => {
      expect(exportSessionPreviewMock).toHaveBeenCalledWith(
        "sess-history",
        expect.objectContaining({
          artifact_id: "word-artifact-1",
          format: "markdown",
        })
      );
    });
  });

  it("keeps history mode on the preview surface even before markdown is loaded", () => {
    render(
      <WordToolPanel
        toolName="教案"
        flowContext={buildFlowContext({
          wordWorkbenchMode: "history",
          wordResultTarget: {
            sessionId: "sess-history",
            runId: "run-history",
            status: "processing",
          },
          capabilityStatus: "backend_ready",
          latestArtifacts: [],
        })}
      />
    );

    expect(screen.queryByText("生成一份教案")).not.toBeInTheDocument();
    expect(screen.getByText("正在加载教案内容...")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "正在生成教案..." })).not.toBeInTheDocument();
  });

  it("does not let history mode overwrite the viewed result with draft values", () => {
    render(
      <WordToolPanel
        toolName="教案"
        flowContext={buildFlowContext({
          wordWorkbenchMode: "history",
          wordResultTarget: {
            sessionId: "sess-history",
            artifactId: "word-artifact-1",
            status: "completed",
          },
          currentDraft: {
            kind: "teaching_document",
            topic: "会被保留在草稿里的课题",
            output_requirements: "这里只是草稿，不该把结果面挤掉",
          },
          capabilityStatus: "backend_ready",
          latestArtifacts: [
            {
              artifactId: "word-artifact-1",
              title: "历史教案",
              status: "completed",
              createdAt: "2026-04-19T15:45:00.000Z",
            },
          ],
        })}
      />
    );

    expect(screen.queryByLabelText("课题")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("会被保留在草稿里的课题")).not.toBeInTheDocument();
  });

  it("shows minimal edit/save/export actions for real artifacts", async () => {
    const onExportArtifact = jest.fn();
    const onStructuredRefineArtifact = jest
      .fn()
      .mockResolvedValue({ ok: true, artifactId: "word-artifact-2" });

    render(
      <PreviewStep
        markdown="# 教学文档"
        isGenerating={false}
        lastGeneratedAt={"2026-04-17T08:00:00.000Z"}
        flowContext={buildFlowContext({
          wordWorkbenchMode: "history",
          capabilityStatus: "backend_ready",
          capabilityReason: "Loaded backend Word document.",
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

    expect(screen.getByText("牛顿第二定律教案")).toBeInTheDocument();
    expect(screen.getByText("基于 牛顿第二定律课件 生成")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存修改" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "打开对话微调" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    const editor = screen.getByPlaceholderText(
      "在这里直接改字。支持 # 标题、## 小节、- 列表。"
    );
    expect(editor).toBeInTheDocument();
    fireEvent.change(editor, { target: { value: "## 教学目标\n\n更新后的内容" } });
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
    await waitFor(() => {
      expect(onStructuredRefineArtifact).toHaveBeenCalledWith(
        expect.objectContaining({
          artifactId: "word-artifact-1",
          refineMode: "structured_refine",
          config: expect.objectContaining({
            markdown_content: expect.any(String),
            document_content: expect.any(Object),
            document_title: "牛顿第二定律教案",
            document_summary: "已更新文档内容。",
            schema_id: "lesson_plan_v1",
          }),
        })
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "预览" }));
    expect(screen.getByText(/## 教学目标/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "导出教案文档" }));
    await waitFor(() => {
      expect(onExportArtifact).toHaveBeenCalledWith("word-artifact-2");
    });
  });

  it("shows an explicit failure state instead of silently falling back to compose", () => {
    render(
      <PreviewStep
        markdown=""
        isGenerating={false}
        lastGeneratedAt={null}
        resultStatus="failed"
        flowContext={buildFlowContext({
          wordWorkbenchMode: "history",
          capabilityStatus: "backend_ready",
        })}
      />
    );

    expect(screen.getByText("本次教学文档生成失败，可直接改写内容后保存新版本。")).toBeInTheDocument();
  });
});
