import { act, fireEvent, render, screen } from "@testing-library/react";
import { QuizToolPanel } from "@/components/project/features/studio/tools/QuizToolPanel";
import type { ToolFlowContext } from "@/components/project/features/studio/tools";

jest.mock("@/components/project/features/studio/tools/useStudioRagRecommendations", () => ({
  useStudioRagRecommendations: () => ({
    suggestions: ["牛顿第二定律"],
    isLoading: false,
  }),
}));

function buildFlowContext(overrides: Partial<ToolFlowContext> = {}): ToolFlowContext {
  return {
    managedWorkbenchMode: "draft",
    isLoadingProtocol: false,
    isActionRunning: false,
    canExecute: true,
    selectedSourceId: null,
    sourceOptions: [],
    currentDraft: {
      scope: "围绕牛顿第二定律设计一组课堂检测题",
    },
    ...overrides,
  };
}

function createDeferred() {
  let resolve: (value: boolean) => void = () => undefined;
  const promise = new Promise<boolean>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("quiz panel two-state workbench", () => {
  it("renders only draft card in draft mode", () => {
    render(
      <QuizToolPanel
        toolId="quiz"
        toolName="随堂小测"
        flowContext={buildFlowContext()}
      />
    );

    expect(screen.getByLabelText("考查范围 / 出题主题")).toBeInTheDocument();
    expect(screen.getByText("轻配置")).toBeInTheDocument();
    expect(screen.queryByText("第 1 / 1 题")).not.toBeInTheDocument();
  });

  it("keeps scope empty after the user clears auto-suggested text", () => {
    const onDraftChange = jest.fn();

    render(
      <QuizToolPanel
        toolId="quiz"
        toolName="随堂小测"
        onDraftChange={onDraftChange}
        flowContext={buildFlowContext({
          currentDraft: {
            scope: "牛顿第二定律",
          },
        })}
      />
    );

    const scopeInput = screen.getByLabelText("考查范围 / 出题主题");
    fireEvent.change(scopeInput, { target: { value: "" } });

    expect(scopeInput).toHaveValue("");
    expect(onDraftChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        scope: "",
        question_focus: "",
      })
    );
  });

  it("switches to result surface while generation is running", async () => {
    const deferred = createDeferred();
    const onExecute = jest.fn().mockReturnValue(deferred.promise);

    render(
      <QuizToolPanel
        toolId="quiz"
        toolName="随堂小测"
        flowContext={buildFlowContext({
          onPrepareGenerate: () => true,
          onExecute,
        })}
      />
    );

    await act(async () => {
      window.dispatchEvent(new CustomEvent("spectra:quiz:generate"));
    });

    expect(onExecute).toHaveBeenCalled();
    expect(screen.queryByLabelText("考查范围 / 出题主题")).not.toBeInTheDocument();
    expect(screen.getByText("暂未收到后端真实题目")).toBeInTheDocument();

    await act(async () => {
      deferred.resolve(true);
      await deferred.promise;
    });
  });

  it("stays in result surface when opening history mode", () => {
    render(
      <QuizToolPanel
        toolId="quiz"
        toolName="随堂小测"
        flowContext={buildFlowContext({
          managedWorkbenchMode: "history",
        })}
      />
    );

    expect(screen.queryByLabelText("考查范围 / 出题主题")).not.toBeInTheDocument();
    expect(screen.getByText("暂未收到后端真实题目")).toBeInTheDocument();
  });

  it("shows the current-head quiz result surface when an artifact exists", () => {
    render(
      <QuizToolPanel
        toolId="quiz"
        toolName="随堂小测"
        flowContext={buildFlowContext({
          resolvedArtifact: {
            artifactId: "quiz-artifact-1",
            artifactType: "exercise",
            contentKind: "json",
            content: {
              kind: "quiz",
              title: "牛顿定律小测",
              questions: [
                {
                  id: "q-1",
                  question: "牛顿第二定律描述了什么关系？",
                  options: ["力与加速度成正比", "速度与位移成正比"],
                  answer: "力与加速度成正比",
                },
              ],
            },
          },
        })}
      />
    );

    expect(screen.queryByLabelText("考查范围 / 出题主题")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "1" })).not.toBeInTheDocument();
    expect(screen.getByText("牛顿第二定律描述了什么关系？")).toBeInTheDocument();
  });

  it("keeps result mode during transient artifact refresh after edit save", () => {
    const { rerender } = render(
      <QuizToolPanel
        toolId="quiz"
        toolName="随堂小测"
        flowContext={buildFlowContext({
          resolvedArtifact: {
            artifactId: "quiz-artifact-1",
            artifactType: "exercise",
            contentKind: "json",
            content: {
              kind: "quiz",
              title: "牛顿定律小测",
              questions: [
                {
                  id: "q-1",
                  question: "牛顿第二定律描述了什么关系？",
                  options: ["力与加速度成正比", "速度与位移成正比"],
                  answer: "力与加速度成正比",
                },
              ],
            },
          },
        })}
      />
    );

    rerender(
      <QuizToolPanel
        toolId="quiz"
        toolName="随堂小测"
        flowContext={buildFlowContext({
          resolvedArtifact: null,
        })}
      />
    );

    expect(screen.queryByLabelText("考查范围 / 出题主题")).not.toBeInTheDocument();
    expect(screen.getByText("牛顿第二定律描述了什么关系？")).toBeInTheDocument();
  });

  it("resets back to a new draft instead of reopening the previous quiz result", () => {
    const { rerender } = render(
      <QuizToolPanel
        toolId="quiz"
        toolName="随堂小测"
        flowContext={buildFlowContext({
          resolvedArtifact: {
            artifactId: "quiz-artifact-1",
            artifactType: "exercise",
            contentKind: "json",
            content: {
              kind: "quiz",
              title: "牛顿定律小测",
              questions: [
                {
                  id: "q-1",
                  question: "牛顿第二定律描述了什么关系？",
                  options: ["力与加速度成正比", "速度与位移成正比"],
                  answer: "力与加速度成正比",
                },
              ],
            },
          },
          resolvedTarget: {
            kind: "draft",
            toolType: "quiz",
            sessionId: "s-1",
            artifactId: "quiz-artifact-1",
            runId: "run-1",
            status: "completed",
            isHistorical: false,
          },
        })}
      />
    );

    rerender(
      <QuizToolPanel
        toolId="quiz"
        toolName="随堂小测"
        flowContext={buildFlowContext({
          currentDraft: {
            scope: "",
          },
          resolvedArtifact: null,
          resolvedTarget: {
            kind: "draft",
            toolType: "quiz",
            sessionId: "s-1",
            artifactId: null,
            runId: null,
            status: null,
            isHistorical: false,
          },
        })}
      />
    );

    expect(screen.getByLabelText("考查范围 / 出题主题")).toBeInTheDocument();
    expect(screen.queryByText("牛顿第二定律描述了什么关系？")).not.toBeInTheDocument();
  });

  it("responds to header mode events after a result is available", async () => {
    render(
      <QuizToolPanel
        toolId="quiz"
        toolName="随堂小测"
        flowContext={buildFlowContext({
          resolvedArtifact: {
            artifactId: "quiz-artifact-1",
            artifactType: "exercise",
            contentKind: "json",
            content: {
              kind: "quiz",
              questions: [
                {
                  id: "q-1",
                  question: "牛顿第二定律描述了什么关系？",
                  options: ["力与加速度成正比", "速度与位移成正比"],
                  answer: "力与加速度成正比",
                },
              ],
            },
          },
        })}
      />
    );

    expect(screen.getByRole("button", { name: "提交答案" })).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new CustomEvent("spectra:quiz:set-mode", {
          detail: { mode: "edit" },
        })
      );
    });

    expect(screen.queryByRole("button", { name: "提交答案" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("题干")).toBeInTheDocument();
  });
});
