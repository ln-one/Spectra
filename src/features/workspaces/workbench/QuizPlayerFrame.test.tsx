import { fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { QuizAnswer, QuizDeliverySnapshot } from "@/features/artifacts/quizzes/contract";
import { renderWithIntl } from "../../../../tests/render";
import { QuizPlayerFrame } from "./QuizPlayerFrame";

const snapshot: QuizDeliverySnapshot = {
  artifactId: "00000000-0000-4000-8000-000000000001",
  descriptionMarkdown: "Description",
  feedbackMode: "after_submission",
  navigationMode: "free",
  questions: [
    {
      difficulty: "easy",
      options: [
        { optionId: "00000000-0000-4000-8000-000000000011", text: "A" },
        { optionId: "00000000-0000-4000-8000-000000000012", text: "B" },
      ],
      points: 1,
      promptMarkdown: "First",
      questionId: "00000000-0000-4000-8000-000000000003",
      type: "single_choice",
    },
    {
      difficulty: "medium",
      points: 2,
      promptMarkdown: "Second",
      questionId: "00000000-0000-4000-8000-000000000004",
      type: "true_false",
    },
  ],
  revisionId: "00000000-0000-4000-8000-000000000002",
  title: "Quiz",
  totalPoints: 3,
};

test("Quiz player uses the navigation rail as answered state and submits on the last question", () => {
  const answers = new Map<string, QuizAnswer>([
    [
      "00000000-0000-4000-8000-000000000003",
      { optionId: "00000000-0000-4000-8000-000000000011", type: "single_choice" },
    ],
  ]);
  renderWithIntl(
    <QuizPlayerFrame
      answers={answers}
      finishLabel="提交答卷"
      flagged={new Set(["00000000-0000-4000-8000-000000000004"])}
      onFinish={vi.fn()}
      onPageIndexChange={vi.fn()}
      pageIndex={1}
      snapshot={snapshot}
    />,
  );

  expect(screen.getByRole("button", { name: "第 1 题，已作答" })).toHaveClass(
    "border-emerald-500/55",
  );
  expect(screen.getByRole("button", { name: "第 2 题，未作答，已标记" })).toHaveAttribute(
    "aria-current",
    "step",
  );
  expect(screen.getByRole("button", { name: "提交答卷" })).toBeInTheDocument();
  expect(screen.getByText("已答 1 / 2")).toBeInTheDocument();
});

test("Quiz flag control exposes pressed state and toggles the current question", () => {
  const question = snapshot.questions.at(0);
  if (!question) throw new Error("Expected Quiz fixture question");
  const onToggleFlag = vi.fn();
  const rendered = renderWithIntl(
    <QuizPlayerFrame
      answers={new Map()}
      finishLabel="提交答卷"
      flagged={new Set()}
      onFinish={vi.fn()}
      onPageIndexChange={vi.fn()}
      onToggleFlag={onToggleFlag}
      pageIndex={0}
      snapshot={snapshot}
    />,
  );

  const flagButton = screen.getByRole("button", { name: "标记" });
  expect(flagButton).toHaveAttribute("aria-pressed", "false");
  expect(flagButton).toHaveClass("hover:bg-amber-500/8");
  fireEvent.click(flagButton);
  expect(onToggleFlag).toHaveBeenCalledWith(question.questionId);

  rendered.rerender(
    <QuizPlayerFrame
      answers={new Map()}
      finishLabel="提交答卷"
      flagged={new Set([question.questionId])}
      onFinish={vi.fn()}
      onPageIndexChange={vi.fn()}
      onToggleFlag={onToggleFlag}
      pageIndex={0}
      snapshot={snapshot}
    />,
  );
  expect(screen.getByRole("button", { name: "取消标记" })).toHaveAttribute("aria-pressed", "true");
});
