import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  it("renders first backend question, supports answering and question-scoped refine", async () => {
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
    expect(screen.getByText("第 1 题 / 共 2 题")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /A/ }));
    fireEvent.click(screen.getByRole("button", { name: "提交答案" }));

    expect(screen.getByText("回答正确，当前题目理解到位。")).toBeInTheDocument();
    expect(
      screen.getByText("核心是合力、质量与加速度之间的关系。")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "微调当前题" }));

    await waitFor(() => {
      expect(onStructuredRefineArtifact).toHaveBeenCalledWith(
        expect.objectContaining({
          artifactId: "quiz-artifact-1",
          refineMode: "structured_refine",
          selectionAnchor: expect.objectContaining({
            scope: "question",
            anchor_id: "q-1",
            artifact_id: "quiz-artifact-1",
          }),
          config: expect.objectContaining({
            current_question_id: "q-1",
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
});
