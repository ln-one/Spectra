import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { QuizEditProposal } from "@/features/artifacts/proposal-contract";
import type { QuizAttemptDetail, QuizRevisionContent } from "@/features/artifacts/quizzes/contract";
import { createQuizDeliverySnapshot } from "@/features/artifacts/quizzes/delivery";
import type { QuizArtifact } from "@/features/artifacts/quizzes/types";
import { renderWithIntl } from "../../../../tests/render";
import { QuizWorkspaceView } from "./QuizWorkspaceView";

const navigation = vi.hoisted(() => ({ searchParams: "" }));

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(navigation.searchParams),
  };
});

afterEach(() => {
  navigation.searchParams = "";
});

const workspaceId = "00000000-0000-4000-8000-000000000001";
const conversationId = "00000000-0000-4000-8000-000000000005";

const baseQuestion: QuizRevisionContent["questions"][number] = {
  correctOptionId: "00000000-0000-4000-8000-000000000013",
  difficulty: "medium",
  explanationMarkdown: "Explanation",
  options: [
    { optionId: "00000000-0000-4000-8000-000000000013", text: "A" },
    { optionId: "00000000-0000-4000-8000-000000000014", text: "B" },
  ],
  points: 1,
  promptMarkdown: "Short question",
  questionId: "00000000-0000-4000-8000-000000000012",
  type: "single_choice",
};

const baseContent: QuizRevisionContent = {
  descriptionMarkdown: "Description",
  questions: [baseQuestion],
  schemaVersion: 1,
  settings: { feedbackMode: "after_submission", navigationMode: "free" },
  title: "Quiz",
};

const artifact: QuizArtifact = {
  createdAt: "2026-07-20T00:00:00.000Z",
  currentRevision: {
    artifactId: "00000000-0000-4000-8000-000000000010",
    content: baseContent,
    contentSha256: "0".repeat(64),
    createdAt: "2026-07-20T00:00:00.000Z",
    id: "00000000-0000-4000-8000-000000000011",
    parentRevisionId: null,
    revisionNumber: 1,
  },
  id: "00000000-0000-4000-8000-000000000010",
  title: "Quiz",
  updatedAt: "2026-07-20T00:00:00.000Z",
  workspaceId,
};

const proposedContent: QuizRevisionContent = {
  ...baseContent,
  questions: [
    {
      ...baseQuestion,
      promptMarkdown: "Expanded question with context",
    },
  ],
};

const proposal: QuizEditProposal = {
  artifactId: artifact.id,
  baseRevisionId: artifact.currentRevision.id,
  content: proposedContent,
  edits: [
    {
      question: {
        correctOptionIndex: 0,
        difficulty: "medium",
        explanationMarkdown: "Explanation",
        options: ["A", "B"],
        points: 1,
        promptMarkdown: "Expanded question with context",
        type: "single_choice",
      },
      questionId: baseQuestion.questionId,
      type: "update_question",
    },
  ],
  kind: "quiz",
  request: "Expand this question",
  runId: "00000000-0000-4000-8000-000000000015",
  summary: "Expand the selected question",
  title: "Quiz",
};

test("loads Quiz suggestions dynamically and injects the selected prompt", async () => {
  const suggestions = Array.from({ length: 4 }, (_, index) => ({
    prompt: `Quiz prompt ${index}`,
    title: `Quiz suggestion ${index}`,
  }));
  const fetchMock = vi.fn(async () => Response.json({ status: "fresh", suggestions }));
  vi.stubGlobal("fetch", fetchMock);
  const onSuggestion = vi.fn();

  renderWithIntl(
    <QuizWorkspaceView
      artifact={null}
      conversationId={conversationId}
      failureCode={null}
      onArtifactUpdated={vi.fn()}
      onBack={vi.fn()}
      onSuggestion={onSuggestion}
      pendingTitle={null}
      phase="idle"
      workspaceId={workspaceId}
    />,
  );

  expect(screen.getAllByTestId("suggestion-card-skeleton")).toHaveLength(4);
  const suggestion = await screen.findByRole("button", { name: /Quiz suggestion 0/ });
  expect(fetchMock).toHaveBeenCalledWith(
    `/api/artifacts/suggestions?locale=zh-CN&target=quiz&view=artifact-v1&workspaceId=${workspaceId}`,
  );
  expect(screen.getByRole("button", { name: "重新生成建议" })).toBeInTheDocument();
  fireEvent.click(suggestion);
  expect(onSuggestion).toHaveBeenCalledWith("Quiz prompt 0");
});

test("keeps existing Quiz cards visible until a forced refresh returns a newer generation", async () => {
  const oldSuggestions = Array.from({ length: 4 }, (_, index) => ({
    prompt: `Old prompt ${index}`,
    title: `Old suggestion ${index}`,
  }));
  const newSuggestions = Array.from({ length: 4 }, (_, index) => ({
    prompt: `New prompt ${index}`,
    title: `New suggestion ${index}`,
  }));
  const firstGeneration = "2026-07-20T00:00:00.000Z";
  const secondGeneration = "2026-07-20T00:01:00.000Z";
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") {
      return Response.json(
        { generation: firstGeneration, status: "pending", suggestions: [] },
        { status: 202 },
      );
    }
    const url = new URL(String(input), "http://localhost");
    if (url.searchParams.get("afterGeneration") === firstGeneration) {
      return Response.json({
        generation: secondGeneration,
        status: "fresh",
        suggestions: newSuggestions,
      });
    }
    return Response.json({
      generation: firstGeneration,
      status: "fresh",
      suggestions: oldSuggestions,
    });
  });
  vi.stubGlobal("fetch", fetchMock);

  renderWithIntl(
    <QuizWorkspaceView
      artifact={null}
      conversationId={conversationId}
      failureCode={null}
      onArtifactUpdated={vi.fn()}
      onBack={vi.fn()}
      onSuggestion={vi.fn()}
      pendingTitle={null}
      phase="idle"
      workspaceId={workspaceId}
    />,
  );

  expect(await screen.findByText("Old suggestion 0")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "重新生成建议" }));
  expect(screen.getByText("Old suggestion 0")).toBeInTheDocument();
  expect(await screen.findByText("New suggestion 0")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith(
    `/api/artifacts/suggestions?locale=zh-CN&target=quiz&view=artifact-v1&workspaceId=${workspaceId}&afterGeneration=${encodeURIComponent(firstGeneration)}&waitOnly=true`,
  );
});

test("renders the Quiz player structure while generation is in progress", () => {
  renderWithIntl(
    <QuizWorkspaceView
      artifact={null}
      conversationId={conversationId}
      failureCode={null}
      onArtifactUpdated={vi.fn()}
      onBack={vi.fn()}
      onSuggestion={vi.fn()}
      pendingTitle="Network quiz"
      phase="finalizing"
      workspaceId={workspaceId}
    />,
  );

  expect(screen.getByTestId("quiz-generation-skeleton")).toHaveTextContent("正在检查题目与答案");
  expect(screen.queryByTestId("quiz-generation-placeholder")).not.toBeInTheDocument();
});

test("applies a Quiz proposal and returns directly to the updated Quiz", async () => {
  const nextArtifact: QuizArtifact = {
    ...artifact,
    currentRevision: {
      ...artifact.currentRevision,
      content: proposedContent,
      id: "00000000-0000-4000-8000-000000000016",
      parentRevisionId: artifact.currentRevision.id,
      revisionNumber: 2,
    },
    updatedAt: "2026-07-20T00:01:00.000Z",
  };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes("/proposals/") && init?.method === "POST") {
      return Response.json({
        acceptedRevisionId: nextArtifact.currentRevision.id,
        artifact: nextArtifact,
        attempt: null,
      });
    }
    return Response.json({ attempts: [] });
  });
  vi.stubGlobal("fetch", fetchMock);
  const onArtifactUpdated = vi.fn();

  const rendered = renderWithIntl(
    <QuizWorkspaceView
      artifact={artifact}
      conversationId={conversationId}
      failureCode={null}
      onArtifactUpdated={onArtifactUpdated}
      onBack={vi.fn()}
      onProposalDismiss={vi.fn()}
      onSuggestion={vi.fn()}
      pendingTitle={null}
      phase="ready"
      proposal={proposal}
      workspaceId={workspaceId}
    />,
  );

  expect(screen.getByTestId("quiz-proposal-review")).toBeInTheDocument();
  expect(screen.getByText("预览 1 项 AI 更改")).toBeInTheDocument();
  expect(screen.getAllByText("～修改").length).toBeGreaterThan(0);
  expect(screen.getByText("修改前")).toBeInTheDocument();
  expect(screen.getByText("Short question")).toBeInTheDocument();
  expect(screen.getAllByText("Expanded question with context").length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: "应用更改" }));

  await waitFor(() => expect(onArtifactUpdated).toHaveBeenCalledWith(nextArtifact));
  expect(screen.queryByTestId("quiz-proposal-review")).not.toBeInTheDocument();
  expect(screen.queryByText("修改前")).not.toBeInTheDocument();
  expect(screen.queryByText("Short question")).not.toBeInTheDocument();
  expect(screen.getAllByText("Expanded question with context").length).toBeGreaterThan(0);

  const rerender = (nextProposal: QuizEditProposal | null) =>
    rendered.rerender(
      <QuizWorkspaceView
        artifact={artifact}
        conversationId={conversationId}
        failureCode={null}
        onArtifactUpdated={onArtifactUpdated}
        onBack={vi.fn()}
        onProposalDismiss={vi.fn()}
        onSuggestion={vi.fn()}
        pendingTitle={null}
        phase="ready"
        proposal={nextProposal}
        workspaceId={workspaceId}
      />,
    );
  rerender(null);
  rerender(proposal);

  expect(screen.queryByTestId("quiz-proposal-review")).not.toBeInTheDocument();
  expect(screen.getAllByText("Expanded question with context").length).toBeGreaterThan(0);
  expect(screen.queryByText("预览 1 项 AI 更改")).not.toBeInTheDocument();
});

test("updates the current Attempt in place after applying a proposal", async () => {
  const attemptId = "00000000-0000-4000-8000-000000000017";
  navigation.searchParams = `quizView=attempt&attempt=${attemptId}`;
  const attempt: QuizAttemptDetail = {
    answers: [],
    delivery: createQuizDeliverySnapshot({
      artifactId: artifact.id,
      content: baseContent,
      revisionId: artifact.currentRevision.id,
    }),
    id: attemptId,
    result: null,
    state: "in_progress",
  };
  const nextArtifact: QuizArtifact = {
    ...artifact,
    currentRevision: {
      ...artifact.currentRevision,
      content: proposedContent,
      id: "00000000-0000-4000-8000-000000000016",
      parentRevisionId: artifact.currentRevision.id,
      revisionNumber: 2,
    },
  };
  const promotedAttempt: QuizAttemptDetail = {
    ...attempt,
    delivery: createQuizDeliverySnapshot({
      artifactId: artifact.id,
      content: proposedContent,
      revisionId: nextArtifact.currentRevision.id,
    }),
  };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/proposals/") && init?.method === "POST") {
      return Response.json({
        acceptedRevisionId: nextArtifact.currentRevision.id,
        artifact: nextArtifact,
        attempt: promotedAttempt,
      });
    }
    if (url.includes(`/attempts/${attemptId}`)) return Response.json({ attempt });
    return Response.json({
      attempts: [
        {
          artifactRevisionId: artifact.currentRevision.id,
          createdAt: "2026-07-20T00:00:00.000Z",
          id: attemptId,
          score: null,
          state: "in_progress",
          submittedAt: null,
          totalPoints: null,
        },
      ],
    });
  });
  vi.stubGlobal("fetch", fetchMock);

  renderWithIntl(
    <QuizWorkspaceView
      artifact={artifact}
      conversationId={conversationId}
      failureCode={null}
      onArtifactUpdated={vi.fn()}
      onBack={vi.fn()}
      onProposalDismiss={vi.fn()}
      onSuggestion={vi.fn()}
      pendingTitle={null}
      phase="ready"
      proposal={proposal}
      workspaceId={workspaceId}
    />,
  );

  expect(screen.getByTestId("quiz-proposal-review")).toBeInTheDocument();
  expect(screen.queryByTestId("quiz-player-frame")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "应用更改" }));

  expect(await screen.findByTestId("quiz-player-frame")).toBeInTheDocument();
  expect(screen.queryByTestId("quiz-proposal-review")).not.toBeInTheDocument();
  expect(screen.queryByText("Short question")).not.toBeInTheDocument();
  expect(screen.getByText("Expanded question with context")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining("/proposals/"),
    expect.objectContaining({
      body: JSON.stringify({
        attemptId,
        expectedRevisionId: artifact.currentRevision.id,
      }),
      method: "POST",
    }),
  );
});

test("automatically moves a legacy unfinished Attempt to the current Quiz revision", async () => {
  const attemptId = "00000000-0000-4000-8000-000000000018";
  navigation.searchParams = `quizView=attempt&attempt=${attemptId}`;
  const currentArtifact: QuizArtifact = {
    ...artifact,
    currentRevision: {
      ...artifact.currentRevision,
      content: proposedContent,
      id: "00000000-0000-4000-8000-000000000019",
      parentRevisionId: artifact.currentRevision.id,
      revisionNumber: 2,
    },
  };
  const oldAttempt: QuizAttemptDetail = {
    answers: [],
    delivery: createQuizDeliverySnapshot({
      artifactId: artifact.id,
      content: baseContent,
      revisionId: artifact.currentRevision.id,
    }),
    id: attemptId,
    result: null,
    state: "in_progress",
  };
  const currentAttempt: QuizAttemptDetail = {
    ...oldAttempt,
    delivery: createQuizDeliverySnapshot({
      artifactId: artifact.id,
      content: proposedContent,
      revisionId: currentArtifact.currentRevision.id,
    }),
  };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/attempts?") && init?.method === "POST") {
      return Response.json({ attempt: currentAttempt });
    }
    if (url.includes(`/attempts/${attemptId}`)) return Response.json({ attempt: oldAttempt });
    return Response.json({ attempts: [] });
  });
  vi.stubGlobal("fetch", fetchMock);

  renderWithIntl(
    <QuizWorkspaceView
      artifact={currentArtifact}
      conversationId={conversationId}
      failureCode={null}
      onArtifactUpdated={vi.fn()}
      onBack={vi.fn()}
      onSuggestion={vi.fn()}
      pendingTitle={null}
      phase="ready"
      workspaceId={workspaceId}
    />,
  );

  expect(await screen.findByText("Expanded question with context")).toBeInTheDocument();
  expect(screen.queryByText("Short question")).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringMatching(/\/attempts\?/),
    expect.objectContaining({ method: "POST" }),
  );
});

test("discards a proposal immediately without waiting for the parent to remove it", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ attempts: [] })),
  );
  const onProposalDismiss = vi.fn();

  renderWithIntl(
    <QuizWorkspaceView
      artifact={artifact}
      conversationId={conversationId}
      failureCode={null}
      onArtifactUpdated={vi.fn()}
      onBack={vi.fn()}
      onProposalDismiss={onProposalDismiss}
      onSuggestion={vi.fn()}
      pendingTitle={null}
      phase="ready"
      proposal={proposal}
      workspaceId={workspaceId}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "放弃" }));

  expect(onProposalDismiss).toHaveBeenCalledOnce();
  expect(screen.queryByTestId("quiz-proposal-review")).not.toBeInTheDocument();
  expect(await screen.findByText("Short question")).toBeInTheDocument();
  expect(screen.queryByText("Expanded question with context")).not.toBeInTheDocument();
});
