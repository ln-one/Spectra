import { ClipboardList } from "lucide-react";
import { ArtifactWorkbenchShell } from "../ArtifactWorkbenchShell";
import type { ToolFlowContext } from "../types";
import { buildArtifactWorkbenchViewModel } from "../workbenchViewModel";
import { QuizSurfaceAdapter } from "./QuizSurfaceAdapter";
import { useQuizWorkbenchState } from "./useQuizWorkbenchState";

interface PreviewStepProps {
  lastGeneratedAt: string | null;
  flowContext?: ToolFlowContext;
  onAnswering?: () => void;
  onRefining?: () => void;
  onIdle?: () => void;
}

export function PreviewStep({
  lastGeneratedAt,
  flowContext,
  onAnswering,
  onRefining,
  onIdle,
}: PreviewStepProps) {
  const capabilityStatus =
    flowContext?.capabilityStatus ?? "backend_placeholder";
  const capabilityReason =
    flowContext?.capabilityReason ?? "正在等待后端返回真实题目内容。";
  const {
    backendQuestions,
    currentIndex,
    attempts,
    currentQuestion,
    canRefineCurrentQuestion,
    selectOption,
    submitAnswer,
    goToPreviousQuestion,
    goToNextQuestion,
    refineCurrentQuestion,
  } = useQuizWorkbenchState({
    flowContext,
    onAnswering,
    onRefining,
    onIdle,
  });
  const viewModel = buildArtifactWorkbenchViewModel(
    flowContext,
    lastGeneratedAt,
    currentQuestion
      ? `当前聚焦第 ${currentIndex + 1} 题，可继续答题或微调。`
      : "等待后端返回真实小测内容。"
  );

  return (
    <ArtifactWorkbenchShell
      flowContext={{
        ...flowContext,
        capabilityStatus,
        capabilityReason,
      }}
      viewModel={viewModel}
      emptyState={
        <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-12 text-center">
          <ClipboardList className="mx-auto h-8 w-8 text-zinc-400" />
          <p className="mt-3 text-sm font-medium text-zinc-700">
            暂未收到后端真实题目
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            当前不再渲染前端示意题库，等待后端返回题目后会直接显示。
          </p>
        </div>
      }
    >
      {capabilityStatus === "backend_ready" && currentQuestion ? (
        <QuizSurfaceAdapter
          questions={backendQuestions}
          currentIndex={currentIndex}
          attempts={attempts}
          onSelectOption={selectOption}
          onSubmitAnswer={submitAnswer}
          onPreviousQuestion={goToPreviousQuestion}
          onNextQuestion={goToNextQuestion}
          onRefineCurrentQuestion={refineCurrentQuestion}
          canRefineCurrentQuestion={canRefineCurrentQuestion}
        />
      ) : null}
    </ArtifactWorkbenchShell>
  );
}
