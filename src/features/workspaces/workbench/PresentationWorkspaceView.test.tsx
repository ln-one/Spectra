import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { PresentationDetail } from "@/features/artifacts/presentations/types";
import type { PresentationEditProposal } from "@/features/artifacts/proposal-contract";
import { renderWithIntl } from "../../../../tests/render";
import { PresentationWorkspaceView } from "./PresentationWorkspaceView";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const artifactId = "00000000-0000-4000-8000-000000000002";
const revisionId = "00000000-0000-4000-8000-000000000003";
const attemptId = "00000000-0000-4000-8000-000000000004";
const conversationId = "00000000-0000-4000-8000-000000000005";
const proposalRunId = "00000000-0000-4000-8000-000000000026";
const timestamp = "2026-07-26T00:00:00.000Z";

const readyDetail: PresentationDetail = {
  artifact: {
    createdAt: timestamp,
    currentRevision: {
      artifactId,
      content: {
        schemaVersion: 1,
        pageCount: 3,
        pageTitles: ["Opening", "Evidence", "Evidence"],
        summary: "A durable presentation.",
        title: "Durable authoring",
      },
      contentSha256: "a".repeat(64),
      createdAt: timestamp,
      id: revisionId,
      parentRevisionId: null,
      revisionNumber: 1,
    },
    groundingSources: [
      {
        sourceId: "00000000-0000-4000-8000-000000000006",
        sourceName: "lesson.pdf",
      },
    ],
    id: artifactId,
    title: "Durable authoring",
    updatedAt: timestamp,
    workspaceId,
  },
  createdAt: timestamp,
  failureCode: null,
  generationAttemptId: attemptId,
  generationDraft: null,
  generationSequence: 7,
  generationState: "ready",
  id: artifactId,
  kind: "presentation",
  title: "Durable authoring",
  updatedAt: timestamp,
  workspaceId,
};

function renderPresentation(detail: PresentationDetail, phase: "ready" | "failed") {
  const onDetailUpdated = vi.fn();
  renderWithIntl(
    <PresentationWorkspaceView
      conversationId={conversationId}
      detail={detail}
      onBack={vi.fn()}
      onDetailUpdated={onDetailUpdated}
      onSuggestion={vi.fn()}
      phase={phase}
      workspaceId={workspaceId}
    />,
  );
  return onDetailUpdated;
}

test("uses the shared loading state while Presentation suggestions are pending", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ generation: null, status: "pending", suggestions: [] }), {
      headers: { "content-type": "application/json" },
      status: 202,
    }),
  );

  renderWithIntl(
    <PresentationWorkspaceView
      conversationId={conversationId}
      detail={null}
      onBack={vi.fn()}
      onDetailUpdated={vi.fn()}
      onSuggestion={vi.fn()}
      phase="idle"
      workspaceId={workspaceId}
    />,
  );

  expect(await screen.findByText("正在准备建议")).toBeVisible();
  expect(screen.getAllByTestId("suggestion-card-skeleton")).toHaveLength(4);
  fetchMock.mockRestore();
});

test("shows the shared suggestion start view before Presentation creation", async () => {
  const onSuggestion = vi.fn();
  const suggestions = Array.from({ length: 4 }, (_, index) => ({
    prompt: `生成第 ${index + 1} 份智能课件`,
    title: `课件建议 ${index + 1}`,
  }));
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ status: "fresh", suggestions }), {
      headers: { "content-type": "application/json" },
      status: 200,
    }),
  );

  renderWithIntl(
    <PresentationWorkspaceView
      conversationId={conversationId}
      detail={null}
      onBack={vi.fn()}
      onDetailUpdated={vi.fn()}
      onSuggestion={onSuggestion}
      phase="idle"
      workspaceId={workspaceId}
    />,
  );

  fireEvent.click(await screen.findByRole("button", { name: /课件建议 1/ }));
  expect(onSuggestion).toHaveBeenCalledWith("生成第 1 份智能课件");
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("target=presentation"));
  fetchMock.mockRestore();
});

test("shows feedback while regenerating Presentation suggestions", async () => {
  const regenerationConversationId = "00000000-0000-4000-8000-000000000007";
  const currentSuggestions = Array.from({ length: 4 }, (_, index) => ({
    prompt: `当前提示 ${index + 1}`,
    title: `当前建议 ${index + 1}`,
  }));
  const refreshedSuggestions = Array.from({ length: 4 }, (_, index) => ({
    prompt: `刷新提示 ${index + 1}`,
    title: `刷新建议 ${index + 1}`,
  }));
  let resolveRefresh: ((response: Response | PromiseLike<Response>) => void) | undefined;
  const refreshedResponse = new Promise<Response>((resolve) => {
    resolveRefresh = resolve;
  });
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    if (init?.method === "POST") {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            generation: "2026-07-26T00:00:00.000Z",
            status: "pending",
            suggestions: [],
          }),
          { headers: { "content-type": "application/json" }, status: 202 },
        ),
      );
    }
    if (String(input).includes("afterGeneration=")) return refreshedResponse;
    return Promise.resolve(
      new Response(
        JSON.stringify({
          generation: "2026-07-26T00:00:00.000Z",
          status: "fresh",
          suggestions: currentSuggestions,
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );
  });

  renderWithIntl(
    <PresentationWorkspaceView
      conversationId={regenerationConversationId}
      detail={null}
      onBack={vi.fn()}
      onDetailUpdated={vi.fn()}
      onSuggestion={vi.fn()}
      phase="idle"
      workspaceId={workspaceId}
    />,
  );

  fireEvent.click(await screen.findByRole("button", { name: "重新生成建议" }));
  expect(await screen.findByRole("button", { name: "正在准备建议" })).toBeDisabled();
  expect(screen.getByRole("button", { name: /当前建议 1/ })).toBeDisabled();
  const regenerationRequest = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
  expect(JSON.parse(String(regenerationRequest?.[1]?.body))).toEqual(
    expect.objectContaining({ afterGeneration: "2026-07-26T00:00:00.000Z" }),
  );

  resolveRefresh?.(
    new Response(
      JSON.stringify({
        generation: "2026-07-26T00:01:00.000Z",
        status: "fresh",
        suggestions: refreshedSuggestions,
      }),
      { headers: { "content-type": "application/json" }, status: 200 },
    ),
  );
  expect(await screen.findByRole("button", { name: /刷新建议 1/ })).toBeEnabled();
  expect(screen.getByRole("button", { name: "重新生成建议" })).toBeEnabled();
  fetchMock.mockRestore();
});

test("keeps a ready Presentation in the Workbench with a full-screen edit action", () => {
  renderPresentation(readyDetail, "ready");
  expect(screen.getByTestId("presentation-workspace")).toBeVisible();
  expect(screen.getByText("已完成 · 3 页")).toBeVisible();
  expect(screen.getByTestId("presentation-editor-frame")).toBeVisible();
  expect(screen.getByRole("link", { name: "全屏编辑" })).toHaveAttribute(
    "href",
    `/presentations/${artifactId}?conversation=${conversationId}&workspaceId=${workspaceId}`,
  );
});

test("previews a presentation candidate and exposes original/candidate toggles", async () => {
  const proposal: PresentationEditProposal = {
    artifactId,
    baseRevisionId: revisionId,
    candidateSourceBundleId: "00000000-0000-4000-8000-000000000027",
    changedSlidePaths: ["out/pages/slide-1.page"],
    focus: [{ index: 0, path: "slide-1" }],
    kind: "presentation",
    request: "Tighten the opening slide.",
    runId: proposalRunId,
    summary: "Opening slide refined",
    title: "Durable authoring",
  };
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        pageMap: { "pages/slide-1.page": "pageType: cover\nelements: []" },
        pptdContent: "pages: [pages/slide-1.page]",
      }),
      { headers: { "content-type": "application/json" }, status: 200 },
    ),
  );

  renderWithIntl(
    <PresentationWorkspaceView
      conversationId={conversationId}
      detail={readyDetail}
      onBack={vi.fn()}
      onDetailUpdated={vi.fn()}
      onProposalDismiss={vi.fn()}
      onSuggestion={vi.fn()}
      phase="ready"
      proposal={proposal}
      workspaceId={workspaceId}
    />,
  );

  expect(await screen.findByTestId("presentation-proposal-review")).toBeVisible();
  expect(screen.getByRole("button", { name: "原稿" })).toBeVisible();
  expect(screen.getByRole("button", { name: "AI 候选" })).toBeVisible();
  expect(screen.getByTestId("presentation-generation-preview")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "原稿" }));
  expect(screen.getByTestId("presentation-editor-frame")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "AI 候选" }));
  expect(screen.getByTestId("presentation-generation-preview")).toBeVisible();
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining(`/proposals/${proposalRunId}/source`),
    expect.anything(),
  );
  fetchMock.mockRestore();
});

test("uses the shared Artifact generation canvas while Presentation authoring runs", () => {
  const generatingDetail: PresentationDetail = {
    ...readyDetail,
    artifact: null,
    failureCode: null,
    generationDraft: { phase: "authoring", schemaVersion: 1 },
    generationState: "generating",
  };
  renderWithIntl(
    <PresentationWorkspaceView
      conversationId={conversationId}
      detail={generatingDetail}
      onBack={vi.fn()}
      onDetailUpdated={vi.fn()}
      onSuggestion={vi.fn()}
      phase="generating"
      workspaceId={workspaceId}
    />,
  );
  expect(screen.getByTestId("presentation-generation-placeholder")).toBeVisible();
  expect(screen.getAllByText("生成作品")).toHaveLength(2);
});

test("keeps draft PPTD pages in the Workbench generation state", () => {
  const generatingDetail: PresentationDetail = {
    ...readyDetail,
    artifact: null,
    failureCode: null,
    generationDraft: {
      phase: "authoring",
      preview: {
        pageMap: { "pages/cover.page": "pageType: cover\nelements: []" },
        pptdContent: "size: [1280, 720]\npages: [pages/cover.page, pages/body.page]",
        totalPages: 2,
      },
      schemaVersion: 1,
    },
    generationState: "generating",
  };
  renderWithIntl(
    <PresentationWorkspaceView
      conversationId={conversationId}
      detail={generatingDetail}
      onBack={vi.fn()}
      onDetailUpdated={vi.fn()}
      onSuggestion={vi.fn()}
      phase="generating"
      workspaceId={workspaceId}
    />,
  );

  expect(screen.queryByTestId("presentation-editor-frame")).not.toBeInTheDocument();
  expect(screen.getByTestId("presentation-generation-preview")).toBeVisible();
  expect(screen.queryByTestId("presentation-generation-placeholder")).not.toBeInTheDocument();
});

test("keeps completed pages visible with retry controls after generation fails", () => {
  const failedDetail: PresentationDetail = {
    ...readyDetail,
    artifact: null,
    failureCode: "presentation_remote_error",
    generationDraft: {
      phase: "failed",
      preview: {
        pageMap: { "pages/cover.page": "pageType: cover\nelements: []" },
        pptdContent: "size: [1280, 720]\npages: [pages/cover.page, pages/body.page]",
        totalPages: 2,
      },
      schemaVersion: 1,
    },
    generationState: "failed",
  };
  renderPresentation(failedDetail, "failed");
  expect(screen.getByTestId("presentation-generation-preview")).toBeVisible();
  expect(screen.getByRole("button", { name: "重新生成" })).toBeEnabled();
});

test("retries a failed Presentation and replaces the replayed detail", async () => {
  const failedDetail: PresentationDetail = {
    ...readyDetail,
    artifact: null,
    failureCode: "presentation_remote_error",
    generationDraft: { phase: "authoring", schemaVersion: 1 },
    generationState: "failed",
  };
  const queuedDetail: PresentationDetail = {
    ...failedDetail,
    failureCode: null,
    generationDraft: { phase: "queued", schemaVersion: 1 },
    generationState: "queued",
  };
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify({ detail: queuedDetail }), { status: 200 }));
  const onDetailUpdated = renderPresentation(failedDetail, "failed");
  fireEvent.click(screen.getByRole("button", { name: "重新生成" }));
  await waitFor(() => expect(onDetailUpdated).toHaveBeenCalledWith(queuedDetail));
  expect(fetchMock).toHaveBeenCalledWith(
    `/api/artifacts/presentation/${artifactId}/retry`,
    expect.objectContaining({ method: "POST" }),
  );
  fetchMock.mockRestore();
});
