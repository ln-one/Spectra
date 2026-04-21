import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ToolFlowContext } from "@/components/project/features/studio/tools";
import { PreviewStep } from "@/components/project/features/studio/tools/quiz/PreviewStep";

function buildFlowContext(
  overrides: Partial<ToolFlowContext> = {}
): ToolFlowContext {
  return {
    capabilityStatus: "backend_ready",
    capabilityReason: "Loaded backend quiz artifact.",
    resolvedArtifact: {
      artifactId: "quiz-artifact-1",
      artifactType: "exercise",
      contentKind: "json",
      content: {
        kind: "quiz",
        questions: [
          {
            id: "q-1",
            question: "牛顿第二定律描述的核心关系是什么？",
            options: ["力与加速度成正比", "速度与位移成正比"],
            answer: "力与加速度成正比",
            explanation: "核心是合力、质量与加速度之间的关系。",
          },
          {
            id: "q-2",
            question: "减速运动时，加速度方向一定与速度方向相同吗？",
            options: ["一定相同", "不一定相同"],
            answer: "不一定相同",
          },
        ],
      },
    },
    onStructuredRefineArtifact: jest.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
}

describe("quiz preview", () => {
  it("renders first backend question and supports answering", async () => {
    const onStructuredRefineArtifact = jest
      .fn()
      .mockResolvedValue({ ok: true });

    render(
      <PreviewStep
        lastGeneratedAt="2026-04-17T08:00:00.000Z"
        flowContext={buildFlowContext({ onStructuredRefineArtifact })}
      />
    );

    expect(
      screen.getByText("牛顿第二定律描述的核心关系是什么？")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "1" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "2" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /A/ }));
    fireEvent.click(screen.getByRole("button", { name: "提交答案" }));

    expect(screen.getByText("回答正确，当前题目理解到位。")).toBeInTheDocument();
    expect(screen.getByText("已选择：力与加速度成正比")).toBeInTheDocument();
    expect(
      screen.getByText("核心是合力、质量与加速度之间的关系。")
    ).toBeInTheDocument();
    expect(onStructuredRefineArtifact).not.toHaveBeenCalled();
  });

  it("switches to edit mode and saves the current question as a replacement artifact", async () => {
    const onStructuredRefineArtifact = jest.fn().mockResolvedValue({ ok: true });

    render(
      <PreviewStep
        lastGeneratedAt="2026-04-17T08:00:00.000Z"
        flowContext={buildFlowContext({ onStructuredRefineArtifact })}
        surfaceMode="edit"
      />
    );

    const questionInput = screen.getByLabelText("题干");
    fireEvent.change(questionInput, {
      target: { value: "牛顿第二定律强调了什么关系？" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(onStructuredRefineArtifact).toHaveBeenCalledWith(
        expect.objectContaining({
          refineMode: "structured_refine",
          config: expect.objectContaining({
            operation: "direct_edit_question",
            current_question_id: "q-1",
            edited_question: expect.objectContaining({
              id: "q-1",
              question: "牛顿第二定律强调了什么关系？",
            }),
          }),
        })
      );
    });
  });

  it("switches questions and does not invent explanation when backend omitted it", () => {
    render(
      <PreviewStep
        lastGeneratedAt="2026-04-17T08:00:00.000Z"
        flowContext={buildFlowContext()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "下一题" }));
    expect(
      screen.getByText("减速运动时，加速度方向一定与速度方向相同吗？")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /B/ }));
    fireEvent.click(screen.getByRole("button", { name: "提交答案" }));

    expect(screen.getByText("回答正确，当前题目理解到位。")).toBeInTheDocument();
    expect(screen.queryByText("Explanation")).not.toBeInTheDocument();
  });

  it("keeps the current question when a replacement artifact preserves question ids", () => {
    const { rerender } = render(
      <PreviewStep
        lastGeneratedAt="2026-04-17T08:00:00.000Z"
        flowContext={buildFlowContext()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "下一题" }));
    expect(
      screen.getByText("减速运动时，加速度方向一定与速度方向相同吗？")
    ).toBeInTheDocument();

    rerender(
      <PreviewStep
        lastGeneratedAt="2026-04-17T08:00:00.000Z"
        flowContext={buildFlowContext({
          resolvedArtifact: {
            artifactId: "quiz-artifact-2",
            artifactType: "exercise",
            contentKind: "json",
            content: {
              kind: "quiz",
              questions: [
                {
                  id: "q-1",
                  question: "牛顿第二定律描述的核心关系是什么？",
                  options: ["力与加速度成正比", "速度与位移成正比"],
                  answer: "力与加速度成正比",
                  explanation: "核心是合力、质量与加速度之间的关系。",
                },
                {
                  id: "q-2",
                  question: "减速运动时，加速度方向一定与速度方向相同吗？（新版）",
                  options: ["一定相同", "不一定相同"],
                  answer: "不一定相同",
                },
              ],
            },
          },
        })}
      />
    );

    expect(
      screen.getByText("减速运动时，加速度方向一定与速度方向相同吗？（新版）")
    ).toBeInTheDocument();
  });

  it("shows real empty state when backend returned no questions", () => {
    render(
      <PreviewStep
        lastGeneratedAt={null}
        flowContext={buildFlowContext({
          resolvedArtifact: {
            artifactId: "quiz-artifact-2",
            artifactType: "exercise",
            contentKind: "json",
            content: { kind: "quiz", questions: [] },
          },
        })}
      />
    );

    expect(screen.getByText("暂未收到后端真实题目")).toBeInTheDocument();
  });

  it("auto-saves before switching questions in edit mode", async () => {
    const onStructuredRefineArtifact = jest.fn().mockResolvedValue({ ok: true });

    render(
      <PreviewStep
        lastGeneratedAt="2026-04-17T08:00:00.000Z"
        flowContext={buildFlowContext({ onStructuredRefineArtifact })}
        surfaceMode="edit"
      />
    );

    fireEvent.change(screen.getByLabelText("题干"), {
      target: { value: "第一题（已修改）" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "下一题" }));
    });

    await waitFor(() => {
      expect(onStructuredRefineArtifact).toHaveBeenCalled();
    });
  });
});
