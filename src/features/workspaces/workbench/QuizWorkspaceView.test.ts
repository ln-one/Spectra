import { describe, expect, test, vi } from "vitest";
import { leaveQuizArtifact, quizFocusEqual } from "./QuizWorkspaceView";

const firstQuestion = "00000000-0000-4000-8000-000000000001";
const secondQuestion = "00000000-0000-4000-8000-000000000002";
const revisionId = "00000000-0000-4000-8000-000000000003";

describe("Quiz workspace selection", () => {
  test("treats semantically identical focus objects as equal", () => {
    expect(
      quizFocusEqual(
        {
          kind: "quiz_questions",
          questionIds: [firstQuestion],
          revisionId,
        },
        {
          kind: "quiz_questions",
          questionIds: [firstQuestion],
          revisionId,
        },
      ),
    ).toBe(true);
  });

  test("detects question, revision, and cleared focus changes", () => {
    const focus = {
      kind: "quiz_questions" as const,
      questionIds: [firstQuestion],
      revisionId,
    };

    expect(quizFocusEqual(focus, { ...focus, questionIds: [secondQuestion] })).toBe(false);
    expect(quizFocusEqual(focus, { ...focus, revisionId: secondQuestion })).toBe(false);
    expect(quizFocusEqual(focus, null)).toBe(false);
    expect(quizFocusEqual(null, null)).toBe(true);
  });
});

describe("Quiz workspace exit", () => {
  test("flushes an active attempt before exiting", async () => {
    const order: string[] = [];
    await leaveQuizArtifact(
      "attempt",
      async () => {
        order.push("save");
      },
      () => order.push("exit"),
    );

    expect(order).toEqual(["save", "exit"]);
  });

  test("stays in the artifact when saving fails", async () => {
    const onBack = vi.fn();
    await expect(
      leaveQuizArtifact(
        "attempt",
        async () => {
          throw new Error("save_failed");
        },
        onBack,
      ),
    ).rejects.toThrow("save_failed");
    expect(onBack).not.toHaveBeenCalled();
  });

  test("exits non-attempt views without saving", async () => {
    const flush = vi.fn(async () => undefined);
    const onBack = vi.fn();
    await leaveQuizArtifact("preview", flush, onBack);
    expect(flush).not.toHaveBeenCalled();
    expect(onBack).toHaveBeenCalledOnce();
  });
});
