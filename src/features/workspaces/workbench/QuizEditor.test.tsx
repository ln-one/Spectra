import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { QuizRevisionContent } from "@/features/artifacts/quizzes/contract";
import { renderWithIntl } from "../../../../tests/render";
import { QuizEditor } from "./QuizEditor";

const content: QuizRevisionContent = {
  descriptionMarkdown: "Description",
  questions: [
    {
      correctOptionId: "00000000-0000-4000-8000-000000000003",
      difficulty: "easy",
      explanationMarkdown: "First explanation",
      options: [
        { optionId: "00000000-0000-4000-8000-000000000003", text: "A" },
        { optionId: "00000000-0000-4000-8000-000000000004", text: "B" },
      ],
      points: 1,
      promptMarkdown: "First question",
      questionId: "00000000-0000-4000-8000-000000000001",
      type: "single_choice",
    },
    {
      correctOptionId: "00000000-0000-4000-8000-000000000005",
      difficulty: "medium",
      explanationMarkdown: "Second explanation",
      options: [
        { optionId: "00000000-0000-4000-8000-000000000005", text: "C" },
        { optionId: "00000000-0000-4000-8000-000000000006", text: "D" },
      ],
      points: 2,
      promptMarkdown: "Second question",
      questionId: "00000000-0000-4000-8000-000000000002",
      type: "single_choice",
    },
  ],
  schemaVersion: 1,
  settings: { feedbackMode: "after_submission", navigationMode: "free" },
  title: "Quiz",
};

test("Quiz editor reorders with a non-drag control and saves one validated revision", async () => {
  const onSave = vi.fn();
  renderWithIntl(
    <QuizEditor
      content={content}
      issueIds={vi.fn()}
      onCancel={vi.fn()}
      onSave={onSave}
      saving={false}
    />,
  );

  const moveDown = screen.getAllByRole("button", { name: "下移题目" })[0];
  if (!moveDown) throw new Error("Missing move control");
  fireEvent.click(moveDown);
  fireEvent.change(screen.getByRole("textbox", { name: "测验标题" }), {
    target: { value: "Reordered Quiz" },
  });
  const save = screen.getByRole("button", { name: "保存新版" });
  const form = save.closest("form");
  if (!form) throw new Error("Missing Quiz form");
  fireEvent.submit(form);

  await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
  expect(onSave.mock.calls[0]?.[0]).toMatchObject({
    questions: [
      { questionId: "00000000-0000-4000-8000-000000000002" },
      { questionId: "00000000-0000-4000-8000-000000000001" },
    ],
    title: "Reordered Quiz",
  });
});

test("Quiz editor blocks an invalid revision through the shared Zod contract", async () => {
  const onSave = vi.fn();
  renderWithIntl(
    <QuizEditor
      content={content}
      issueIds={vi.fn()}
      onCancel={vi.fn()}
      onSave={onSave}
      saving={false}
    />,
  );

  const firstPoints = screen.getAllByRole("spinbutton", { name: "分值" })[0];
  if (!firstPoints) throw new Error("Missing points control");
  fireEvent.change(firstPoints, {
    target: { value: "0" },
  });
  const save = screen.getByRole("button", { name: "保存新版" });
  const form = save.closest("form");
  if (!form) throw new Error("Missing Quiz form");
  fireEvent.submit(form);

  expect(await screen.findByRole("alert")).toHaveTextContent("测验结构无效");
  expect(onSave).not.toHaveBeenCalled();
});

test("Quiz editor keeps the outline visible while editing one selected question", () => {
  renderWithIntl(
    <QuizEditor
      content={content}
      issueIds={vi.fn()}
      onCancel={vi.fn()}
      onSave={vi.fn()}
      saving={false}
    />,
  );

  expect(screen.getByRole("textbox", { name: "第 1 题题干" })).toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: "第 2 题题干" })).not.toBeInTheDocument();
  const secondOutlineButton = screen.getByText("Second question").closest("button");
  if (!secondOutlineButton) throw new Error("Missing second question outline button");
  fireEvent.click(secondOutlineButton);
  expect(screen.getByRole("textbox", { name: "第 2 题题干" })).toHaveValue("Second question");
  expect(screen.queryByRole("textbox", { name: "第 1 题题干" })).not.toBeInTheDocument();
});

test("Quiz editor preserves boolean answers for true/false questions", async () => {
  const onSave = vi.fn();
  const trueFalseContent: QuizRevisionContent = {
    ...content,
    questions: [
      {
        correctAnswer: true,
        difficulty: "easy",
        explanationMarkdown: "Explanation",
        points: 1,
        promptMarkdown: "Statement",
        questionId: "00000000-0000-4000-8000-000000000007",
        type: "true_false",
      },
    ],
  };
  renderWithIntl(
    <QuizEditor
      content={trueFalseContent}
      issueIds={vi.fn()}
      onCancel={vi.fn()}
      onSave={onSave}
      saving={false}
    />,
  );
  const save = screen.getByRole("button", { name: "保存新版" });
  const form = save.closest("form");
  if (!form) throw new Error("Missing Quiz form");
  fireEvent.submit(form);

  await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
  expect(onSave.mock.calls[0]?.[0]).toMatchObject({
    questions: [{ correctAnswer: true, type: "true_false" }],
  });
});

test("Quiz editor previews the validated in-memory draft without saving it", async () => {
  const onSave = vi.fn();
  renderWithIntl(
    <QuizEditor
      content={content}
      issueIds={vi.fn()}
      onCancel={vi.fn()}
      onSave={onSave}
      saving={false}
    />,
  );

  fireEvent.change(screen.getByRole("textbox", { name: "第 1 题题干" }), {
    target: { value: "Unsaved preview question" },
  });
  fireEvent.click(screen.getByRole("button", { name: "预览草稿" }));

  expect(await screen.findByText("草稿预览")).toBeInTheDocument();
  expect(screen.getByTestId("quiz-player-frame")).toHaveClass("flex-1", "min-h-0", "max-h-none");
  expect(screen.getByText("Unsaved preview question")).toBeInTheDocument();
  expect(screen.getByText("预览不会创建作答记录。")).toBeInTheDocument();
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "返回编辑" }));
  expect(screen.getByRole("textbox", { name: "第 1 题题干" })).toHaveValue(
    "Unsaved preview question",
  );
});
