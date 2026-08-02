import { fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { QuizAnswer, QuizDeliverySnapshot } from "@/features/artifacts/quizzes/contract";
import { renderWithIntl } from "../../../../tests/render";
import { QuizSurveyRuntime } from "./QuizSurveyRuntime";

const questionId = "00000000-0000-4000-8000-000000000003";
const firstOptionId = "00000000-0000-4000-8000-000000000004";
const secondOptionId = "00000000-0000-4000-8000-000000000005";
const snapshot: QuizDeliverySnapshot = {
  artifactId: "00000000-0000-4000-8000-000000000001",
  descriptionMarkdown: "Description",
  feedbackMode: "after_submission",
  navigationMode: "free",
  questions: [
    {
      difficulty: "easy",
      options: [
        { optionId: firstOptionId, text: "Option A" },
        { optionId: secondOptionId, text: "Option B" },
      ],
      points: 1,
      promptMarkdown: "Question",
      questionId,
      type: "single_choice",
    },
  ],
  revisionId: "00000000-0000-4000-8000-000000000002",
  title: "Quiz",
  totalPoints: 1,
};

test("Quiz Survey keeps its model stable and applies server answer updates without echoing saves", () => {
  const onAnswer = vi.fn();
  const rendered = renderWithIntl(
    <QuizSurveyRuntime
      answers={new Map()}
      onAnswer={onAnswer}
      pageIndex={0}
      showChrome={false}
      snapshot={snapshot}
    />,
  );

  fireEvent.click(screen.getByRole("radio", { name: "Option A" }));
  expect(onAnswer).toHaveBeenCalledOnce();
  expect(onAnswer).toHaveBeenLastCalledWith(questionId, {
    optionId: firstOptionId,
    type: "single_choice",
  });

  const firstAnswer: QuizAnswer = { optionId: firstOptionId, type: "single_choice" };
  rendered.rerender(
    <QuizSurveyRuntime
      answers={new Map([[questionId, firstAnswer]])}
      onAnswer={onAnswer}
      pageIndex={0}
      showChrome={false}
      snapshot={snapshot}
    />,
  );
  expect(screen.getByRole("radio", { name: "Option A" })).toBeChecked();
  expect(onAnswer).toHaveBeenCalledOnce();

  const secondAnswer: QuizAnswer = { optionId: secondOptionId, type: "single_choice" };
  rendered.rerender(
    <QuizSurveyRuntime
      answers={new Map([[questionId, secondAnswer]])}
      onAnswer={onAnswer}
      pageIndex={0}
      showChrome={false}
      snapshot={snapshot}
    />,
  );
  expect(screen.getByRole("radio", { name: "Option B" })).toBeChecked();
  expect(onAnswer).toHaveBeenCalledOnce();
});

test("Quiz Survey renders option formulas through the shared safe Markdown pipeline", () => {
  const question = snapshot.questions.at(0);
  if (!question) throw new Error("Expected Quiz fixture question");
  if (question.type !== "single_choice") throw new Error("Expected single-choice Quiz fixture");
  const rendered = renderWithIntl(
    <QuizSurveyRuntime
      answers={new Map()}
      pageIndex={0}
      showChrome={false}
      snapshot={{
        ...snapshot,
        questions: [
          {
            ...question,
            options: [
              { optionId: firstOptionId, text: String.raw`$P(c\mid x)$` },
              { optionId: secondOptionId, text: String.raw`Broken $\frac{$` },
            ],
          },
        ],
      }}
    />,
  );

  expect(rendered.container.querySelector(".katex")).toBeInTheDocument();
  expect(rendered.container.querySelector(".katex-error")).toHaveTextContent("frac");
});
