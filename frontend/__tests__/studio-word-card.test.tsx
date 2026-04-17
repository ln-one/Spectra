import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ToolFlowContext } from "@/components/project/features/studio/tools";
import { PreviewStep } from "@/components/project/features/studio/tools/word/PreviewStep";
import { GenerateStep } from "@/components/project/features/studio/tools/word/GenerateStep";

jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

jest.mock("remark-gfm", () => ({
  __esModule: true,
  default: () => undefined,
}));

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

describe("studio word card", () => {
  it("disables generation when required source artifact is missing", () => {
    render(
      <GenerateStep
        topic="牛顿第二定律"
        goal="形成受力分析与加速度关系的完整理解"
        teachingContext=""
        studentNeeds=""
        outputRequirements=""
        documentVariant="layered_lesson_plan"
        teachingModel="scaffolded"
        gradeBand="high"
        difficultyLayer="B"
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
      screen.getByText("必选：请绑定一个 PPT 成果作为文档来源。")
    ).toBeInTheDocument();
    expect(
      screen.getByText("当前还没有可绑定成果，点击上方按钮即可刷新。")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成正式文档" })).toBeDisabled();
  });

  it("shows source binding, download and chat refine actions for real artifacts", () => {
    const onRefine = jest.fn();
    const onExportArtifact = jest.fn();

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

    expect(screen.getByText("当前绑定来源：已绑定")).toBeInTheDocument();
    expect(screen.getByText("来源成果标题：牛顿第二定律课件")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "打开对话微调" }));
    fireEvent.click(screen.getByRole("button", { name: "下载正式文档" }));
    expect(onRefine).toHaveBeenCalledTimes(1);
    expect(onExportArtifact).toHaveBeenCalledWith("word-artifact-1");
  });
});
