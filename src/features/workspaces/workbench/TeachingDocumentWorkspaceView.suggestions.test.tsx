import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { applyTeachingDocumentRefineEdits } from "@/features/artifacts/documents/refine";
import type { TeachingDocumentArtifact } from "@/features/artifacts/documents/types";
import type { TeachingDocumentEditProposal } from "@/features/artifacts/proposal-contract";
import { renderWithIntl } from "../../../../tests/render";
import { navigateToDocumentExport } from "./document-export-navigation";
import { TeachingDocumentWorkspaceView } from "./TeachingDocumentWorkspaceView";

vi.mock("./document-export-navigation", () => ({ navigateToDocumentExport: vi.fn() }));

const readyArtifact = {
  createdAt: "2026-07-18T01:00:00.000Z",
  currentRevision: {
    artifactId: "00000000-0000-4000-8000-000000000201",
    content: {
      document: {
        content: [
          {
            attrs: { id: "document-body" },
            content: [{ text: "Document body", type: "text" as const }],
            type: "paragraph" as const,
          },
        ],
        type: "doc" as const,
      },
      generation: { outcome: "complete" as const, rawOutput: "Document body", warnings: [] },
      schemaVersion: 2 as const,
      sourceMarkdown: "Document body",
      title: "Document",
    },
    contentSha256: "a".repeat(64),
    createdAt: "2026-07-18T01:00:00.000Z",
    id: "00000000-0000-4000-8000-000000000202",
    parentRevisionId: null,
    revisionNumber: 1,
  },
  id: "00000000-0000-4000-8000-000000000201",
  title: "Document",
  updatedAt: "2026-07-18T01:00:00.000Z",
  workspaceId: "00000000-0000-4000-8000-000000000002",
};

const mathArtifact: TeachingDocumentArtifact = {
  ...readyArtifact,
  currentRevision: {
    ...readyArtifact.currentRevision,
    content: {
      document: {
        content: [
          {
            attrs: { id: "inline-math" },
            content: [{ text: String.raw`Posterior $P(c\mid x)$`, type: "text" }],
            type: "paragraph",
          },
          {
            attrs: { id: "math-list", start: 1, type: null },
            content: [
              {
                attrs: { id: "math-item" },
                content: [
                  {
                    attrs: { id: "block-math-source" },
                    content: [
                      {
                        marks: [{ type: "bold" }],
                        text: "贝叶斯更新",
                        type: "text",
                      },
                      {
                        text: String.raw`：
$$
\frac{P(x\mid c)P(c)}{P(x)}
$$`,
                        type: "text",
                      },
                    ],
                    type: "paragraph",
                  },
                ],
                type: "listItem",
              },
            ],
            type: "orderedList",
          },
        ],
        type: "doc",
      },
      generation: {
        outcome: "complete",
        rawOutput: String.raw`Posterior $P(c\mid x)$

$$
\frac{P(x\mid c)P(c)}{P(x)}
$$`,
        warnings: [],
      },
      schemaVersion: 2,
      sourceMarkdown: String.raw`Posterior $P(c\mid x)$

$$
\frac{P(x\mid c)P(c)}{P(x)}
$$`,
      title: "Document",
    },
  },
};

const titleOnlyArtifact: TeachingDocumentArtifact = {
  ...readyArtifact,
  currentRevision: {
    ...readyArtifact.currentRevision,
    content: {
      document: {
        content: [
          {
            attrs: { id: "document-title", level: 1 },
            content: [{ text: "Document", type: "text" }],
            type: "heading",
          },
        ],
        type: "doc",
      },
      generation: { outcome: "complete", rawOutput: "# Document", warnings: [] },
      schemaVersion: 2,
      sourceMarkdown: "# Document",
      title: "Document",
    },
  },
};

const suggestions = [
  { prompt: "Prompt one", title: "Suggestion one" },
  { prompt: "Prompt two", title: "Suggestion two" },
  { prompt: "Prompt three", title: "Suggestion three" },
  { prompt: "Prompt four", title: "Suggestion four" },
];

const proposal: TeachingDocumentEditProposal = {
  artifactId: readyArtifact.id,
  baseRevisionId: readyArtifact.currentRevision.id,
  edits: [
    {
      blockId: "document-body",
      operation: "replace_block",
      replacementMarkdown: "Rewritten body",
    },
  ],
  kind: "teaching_document",
  request: "Rewrite the selected paragraph",
  runId: "00000000-0000-4000-8000-000000000203",
  summary: "Tighten the opening paragraph",
  title: readyArtifact.title,
};

function Harness() {
  const [open, setOpen] = useState(true);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}>
        Open document workspace
      </button>
    );
  }
  return (
    <TeachingDocumentWorkspaceView
      artifact={null}
      conversationId="00000000-0000-4000-8000-000000000001"
      draft={null}
      failureCode={null}
      onArtifactUpdated={vi.fn()}
      onBack={() => setOpen(false)}
      onSuggestion={vi.fn()}
      pendingTitle={null}
      phase="idle"
      workspaceId="00000000-0000-4000-8000-000000000002"
    />
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ status: "fresh", suggestions })),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

test("reuses cached suggestions when the document workspace is reopened", async () => {
  renderWithIntl(<Harness />);

  expect(await screen.findByText("Suggestion one")).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenNthCalledWith(
    1,
    "/api/artifacts/suggestions?locale=zh-CN&target=teaching_document&view=artifact-v1&workspaceId=00000000-0000-4000-8000-000000000002",
  );
  expect(screen.getByText("Suggestion one").closest("button")).toHaveClass(
    "h-[172px]",
    "justify-center",
  );

  fireEvent.click(screen.getByRole("button", { name: "返回备课工坊" }));
  fireEvent.click(screen.getByRole("button", { name: "Open document workspace" }));

  expect(await screen.findByText("Suggestion one")).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole("button", { name: "重新生成建议" }));
  await waitFor(() =>
    expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "POST")).toBe(true),
  );
  const regenerationRequest = vi
    .mocked(fetch)
    .mock.calls.find(([, init]) => init?.method === "POST");
  expect(regenerationRequest?.[0]).toBe("/api/artifacts/suggestions");
  expect(JSON.parse(String(regenerationRequest?.[1]?.body))).toEqual(
    expect.objectContaining({
      afterGeneration: "missing",
      locale: "zh-CN",
      target: "teaching_document",
      workspaceId: "00000000-0000-4000-8000-000000000002",
    }),
  );
});

test("keeps current suggestions visible when a background refresh fails", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(Response.json({ status: "fresh", suggestions }))
      .mockResolvedValueOnce(Response.json({}, { status: 503 })),
  );
  renderWithIntl(<Harness />);

  expect(await screen.findByText("Suggestion one")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "重新生成建议" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("建议暂时无法刷新");
  expect(screen.getByText("Suggestion one")).toBeInTheDocument();
});

test("renders the pending suggestion state without treating an empty snapshot as content", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ status: "pending", suggestions: [] }, { status: 202 })),
  );

  renderWithIntl(<Harness />);

  expect(await screen.findAllByTestId("suggestion-card-skeleton")).toHaveLength(4);
  expect(screen.getByTestId("teaching-document-workspace")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("renders the failed suggestion state without crashing the Artifact workspace", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ status: "failed", suggestions: [] })),
  );

  renderWithIntl(<Harness />);

  expect(await screen.findByRole("alert")).toHaveTextContent("建议暂时无法刷新");
  expect(screen.getByTestId("teaching-document-workspace")).toBeInTheDocument();
});

test("restarts streaming scroll lock when an idle workspace starts generating", () => {
  const idle = (
    <TeachingDocumentWorkspaceView
      artifact={null}
      conversationId="00000000-0000-4000-8000-000000000001"
      draft={null}
      failureCode={null}
      onArtifactUpdated={vi.fn()}
      onBack={vi.fn()}
      onSuggestion={vi.fn()}
      pendingTitle={null}
      phase="idle"
      workspaceId="00000000-0000-4000-8000-000000000002"
    />
  );
  const { rerender } = renderWithIntl(idle);
  const idleScrollRoot = screen.getByTestId("document-live-scroll");

  rerender(
    <TeachingDocumentWorkspaceView
      artifact={null}
      conversationId="00000000-0000-4000-8000-000000000001"
      draft={{
        format: "markdown",
        markdown: "# 流式文档\n\n正在追加的正文",
      }}
      failureCode={null}
      onArtifactUpdated={vi.fn()}
      onBack={vi.fn()}
      onSuggestion={vi.fn()}
      pendingTitle="流式文档"
      phase="generating"
      workspaceId="00000000-0000-4000-8000-000000000002"
    />,
  );

  const generatingScrollRoot = screen.getByTestId("document-live-scroll");
  const body = screen.getByText("正在追加的正文");
  expect(generatingScrollRoot).not.toBe(idleScrollRoot);
  expect(body.closest(".workspace-artifact-canvas")).not.toBeNull();
  expect(body.closest(".overflow-y-auto")).not.toBeNull();
  expect(screen.queryByTestId("document-generation-placeholder")).not.toBeInTheDocument();
});

test("shows a breathing status before the first streamed block", () => {
  renderWithIntl(
    <TeachingDocumentWorkspaceView
      artifact={null}
      conversationId="00000000-0000-4000-8000-000000000001"
      draft={null}
      failureCode={null}
      onArtifactUpdated={vi.fn()}
      onBack={vi.fn()}
      onSuggestion={vi.fn()}
      pendingTitle="等待生成的教学文档"
      phase="generating"
      workspaceId="00000000-0000-4000-8000-000000000002"
    />,
  );

  const placeholder = screen.getByTestId("document-generation-placeholder");
  expect(placeholder).toHaveAttribute("role", "status");
  expect(placeholder).toHaveTextContent("正在生成文档");
  expect(placeholder.querySelector("[aria-hidden='true']")).not.toBeNull();
});

test("renders an implicit streamed pipe table with semantic cells", () => {
  const rendered = renderWithIntl(
    <TeachingDocumentWorkspaceView
      artifact={null}
      conversationId="00000000-0000-4000-8000-000000000001"
      draft={{
        format: "markdown",
        markdown: "阶段 | 时间跨度\n批处理时代 | 1950s\n命令行 | 1970s",
      }}
      failureCode={null}
      onArtifactUpdated={vi.fn()}
      onBack={vi.fn()}
      onSuggestion={vi.fn()}
      pendingTitle="流式表格"
      phase="generating"
      workspaceId="00000000-0000-4000-8000-000000000002"
    />,
  );

  expect(rendered.container.querySelector(".teaching-document-markdown table")).not.toBeNull();
  expect(rendered.container.querySelectorAll(".teaching-document-markdown th")).toHaveLength(2);
  expect(rendered.container.querySelectorAll(".teaching-document-markdown td")).toHaveLength(4);
});

test("distinguishes a queued document from active drafting", () => {
  renderWithIntl(
    <TeachingDocumentWorkspaceView
      artifact={null}
      conversationId="00000000-0000-4000-8000-000000000001"
      draft={null}
      failureCode={null}
      onArtifactUpdated={vi.fn()}
      onBack={vi.fn()}
      onSuggestion={vi.fn()}
      pendingTitle="等待处理的教学文档"
      phase="generating"
      queued
      workspaceId="00000000-0000-4000-8000-000000000002"
    />,
  );

  const placeholder = screen.getByTestId("document-generation-placeholder");
  expect(placeholder).toHaveTextContent("等待开始");
  expect(placeholder).toHaveTextContent("等待处理的教学文档");
  expect(placeholder).not.toHaveTextContent("正在生成文档");
});

test("renders empty suggestion placeholders at the final card size", () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => undefined)),
  );

  renderWithIntl(<Harness />);

  expect(screen.getByRole("status")).toHaveTextContent("正在准备建议");
  const placeholders = screen.getAllByTestId("suggestion-card-skeleton");
  expect(placeholders).toHaveLength(4);
  for (const placeholder of placeholders) {
    expect(placeholder).toHaveClass("h-[172px]", "workspace-suggestion-card");
    expect(placeholder).toBeEmptyDOMElement();
  }
});

test("uses the artifact tone for document actions", () => {
  renderWithIntl(
    <TeachingDocumentWorkspaceView
      artifact={readyArtifact}
      conversationId="00000000-0000-4000-8000-000000000001"
      draft={null}
      failureCode={null}
      onArtifactUpdated={vi.fn()}
      onBack={vi.fn()}
      onSuggestion={vi.fn()}
      pendingTitle={null}
      phase="ready"
      workspaceId="00000000-0000-4000-8000-000000000002"
    />,
  );

  expect(screen.getByRole("button", { name: "返回备课工坊" })).toHaveClass(
    "workspace-artifact-back-button",
  );
  expect(screen.getByRole("button", { name: "返回备课工坊" })).not.toHaveClass(
    "bg-[var(--studio-emphasis)]",
  );
  expect(screen.getByRole("button", { name: "编辑" })).not.toHaveClass(
    "bg-[var(--studio-emphasis)]",
  );
  expect(screen.getByRole("button", { name: "导出" })).not.toHaveClass(
    "bg-[var(--studio-emphasis)]",
  );
});

test("renders an inline AI proposal and saves only after explicit acceptance", async () => {
  const scrollIntoView = vi.fn();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });
  const onArtifactUpdated = vi.fn();
  const onProposalDismiss = vi.fn();
  const acceptedContent = applyTeachingDocumentRefineEdits(
    readyArtifact.currentRevision.content,
    proposal.edits,
  ).content;
  const acceptedArtifact: TeachingDocumentArtifact = {
    ...readyArtifact,
    currentRevision: {
      ...readyArtifact.currentRevision,
      content: acceptedContent,
      id: "00000000-0000-4000-8000-000000000204",
      parentRevisionId: readyArtifact.currentRevision.id,
      revisionNumber: 2,
    },
  };
  const fetchMock = vi.fn(async () =>
    Response.json({
      acceptedRevisionId: acceptedArtifact.currentRevision.id,
      artifact: acceptedArtifact,
    }),
  );
  vi.stubGlobal("fetch", fetchMock);

  const rendered = renderWithIntl(
    <TeachingDocumentWorkspaceView
      artifact={readyArtifact}
      conversationId="00000000-0000-4000-8000-000000000001"
      draft={null}
      failureCode={null}
      onArtifactUpdated={onArtifactUpdated}
      onBack={vi.fn()}
      onProposalDismiss={onProposalDismiss}
      onSuggestion={vi.fn()}
      pendingTitle={null}
      phase="ready"
      proposal={proposal}
      workspaceId="00000000-0000-4000-8000-000000000002"
    />,
  );

  expect(await screen.findByText("Tighten the opening paragraph")).toBeInTheDocument();
  expect(await screen.findByText("修改前")).toBeInTheDocument();
  expect(await screen.findByText("修改后")).toBeInTheDocument();
  expect(await screen.findByText("Rewritten body")).toBeInTheDocument();
  expect(rendered.container.querySelector(".teaching-document-refine-removed")).not.toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
  await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());

  scrollIntoView.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "AI 修改提案 · 1 处" }));
  expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });

  fireEvent.click(screen.getByRole("button", { name: "接受" }));

  await waitFor(() => expect(onArtifactUpdated).toHaveBeenCalledWith(acceptedArtifact));
  expect(screen.queryByText("文档已更新")).not.toBeInTheDocument();
  expect(await screen.findByText("Rewritten body")).toBeInTheDocument();
  expect(screen.queryByText("Document body")).not.toBeInTheDocument();
  expect(rendered.container.querySelector(".teaching-document-refine-removed")).toBeNull();

  rendered.rerender(
    <TeachingDocumentWorkspaceView
      artifact={acceptedArtifact}
      conversationId="00000000-0000-4000-8000-000000000001"
      draft={null}
      failureCode={null}
      onArtifactUpdated={onArtifactUpdated}
      onBack={vi.fn()}
      onProposalDismiss={onProposalDismiss}
      onSuggestion={vi.fn()}
      pendingTitle={null}
      phase="ready"
      proposal={null}
      workspaceId="00000000-0000-4000-8000-000000000002"
    />,
  );
  expect(screen.queryByText("已应用 1 处修改，已保存为第 2 版。")).not.toBeInTheDocument();
  expect(await screen.findByText("Rewritten body")).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/artifacts/teaching-document/00000000-0000-4000-8000-000000000201/proposals/00000000-0000-4000-8000-000000000203?conversationId=00000000-0000-4000-8000-000000000001&workspaceId=00000000-0000-4000-8000-000000000002",
    expect.objectContaining({
      body: JSON.stringify({ expectedRevisionId: readyArtifact.currentRevision.id }),
      method: "POST",
    }),
  );
  expect(onProposalDismiss).toHaveBeenCalledTimes(1);
});

test("keeps the assistant focus visibly highlighted after capturing document context", async () => {
  const rendered = renderWithIntl(
    <TeachingDocumentWorkspaceView
      artifact={readyArtifact}
      conversationId="00000000-0000-4000-8000-000000000001"
      draft={null}
      failureCode={null}
      focus={{
        blockIds: ["document-body"],
        kind: "teaching_document_blocks",
        revisionId: readyArtifact.currentRevision.id,
        selectedText: "Document body",
      }}
      onArtifactUpdated={vi.fn()}
      onBack={vi.fn()}
      onSuggestion={vi.fn()}
      pendingTitle={null}
      phase="ready"
      workspaceId="00000000-0000-4000-8000-000000000002"
    />,
  );

  await waitFor(() =>
    expect(rendered.container.querySelector(".teaching-document-assistant-focus")).not.toBeNull(),
  );
});

test("fails closed when a proposal targets an older revision", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  renderWithIntl(
    <TeachingDocumentWorkspaceView
      artifact={readyArtifact}
      conversationId="00000000-0000-4000-8000-000000000001"
      draft={null}
      failureCode={null}
      onArtifactUpdated={vi.fn()}
      onBack={vi.fn()}
      onSuggestion={vi.fn()}
      pendingTitle={null}
      phase="ready"
      proposal={{
        ...proposal,
        baseRevisionId: "00000000-0000-4000-8000-000000000299",
      }}
      workspaceId="00000000-0000-4000-8000-000000000002"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "接受" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("文档已产生新版本");
  expect(fetchMock).not.toHaveBeenCalled();
});

test("renders inline and block LaTeX without synchronously flushing during mount", async () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const rendered = renderWithIntl(
    <TeachingDocumentWorkspaceView
      artifact={mathArtifact}
      conversationId="00000000-0000-4000-8000-000000000001"
      draft={null}
      failureCode={null}
      onArtifactUpdated={vi.fn()}
      onBack={vi.fn()}
      onSuggestion={vi.fn()}
      pendingTitle={null}
      phase="ready"
      workspaceId="00000000-0000-4000-8000-000000000002"
    />,
  );

  await waitFor(() => {
    expect(
      rendered.container.querySelectorAll(".teaching-document-editor .katex").length,
    ).toBeGreaterThanOrEqual(2);
  });
  expect(
    rendered.container.querySelector(
      '.teaching-document-editor .tiptap-mathematics-render[data-type="block-math"]',
    ),
  ).not.toBeNull();
  expect(consoleError.mock.calls.some(([message]) => String(message).includes("flushSync"))).toBe(
    false,
  );
  consoleError.mockRestore();
});

test("renders a title-only revision with an empty editable body", async () => {
  const rendered = renderWithIntl(
    <TeachingDocumentWorkspaceView
      artifact={titleOnlyArtifact}
      conversationId="00000000-0000-4000-8000-000000000001"
      draft={null}
      failureCode={null}
      onArtifactUpdated={vi.fn()}
      onBack={vi.fn()}
      onSuggestion={vi.fn()}
      pendingTitle={null}
      phase="ready"
      workspaceId="00000000-0000-4000-8000-000000000002"
    />,
  );

  await waitFor(() => {
    expect(
      rendered.container.querySelector(
        ".teaching-document-editor p[data-id='document-empty-body']",
      ),
    ).not.toBeNull();
  });
});

test("starts export once, then polls read-only until a terminal state", async () => {
  vi.useFakeTimers();
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ downloadUrl: null, job: { state: "queued" } }, { status: 202 }),
    )
    .mockResolvedValueOnce(
      Response.json({ downloadUrl: null, job: { state: "failed" } }, { status: 202 }),
    );
  vi.stubGlobal("fetch", fetchMock);
  renderWithIntl(
    <TeachingDocumentWorkspaceView
      artifact={readyArtifact}
      conversationId="00000000-0000-4000-8000-000000000001"
      draft={null}
      failureCode={null}
      onArtifactUpdated={vi.fn()}
      onBack={vi.fn()}
      onSuggestion={vi.fn()}
      pendingTitle={null}
      phase="ready"
      workspaceId="00000000-0000-4000-8000-000000000002"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "导出" }));
  await act(async () => undefined);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_000);
  });

  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "GET" });
  expect(screen.getByRole("button", { name: "导出失败" })).toBeEnabled();
});

test("downloads a ready export without navigating away from the workspace", async () => {
  const downloadUrl =
    "/api/artifacts/teaching-document/00000000-0000-4000-8000-000000000201/export?download=1&revisionId=00000000-0000-4000-8000-000000000202";
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(Response.json({ downloadUrl, job: { state: "ready" } }, { status: 200 })),
  );
  vi.mocked(navigateToDocumentExport).mockReset();
  renderWithIntl(
    <TeachingDocumentWorkspaceView
      artifact={readyArtifact}
      conversationId="00000000-0000-4000-8000-000000000001"
      draft={null}
      failureCode={null}
      onArtifactUpdated={vi.fn()}
      onBack={vi.fn()}
      onSuggestion={vi.fn()}
      pendingTitle={null}
      phase="ready"
      workspaceId="00000000-0000-4000-8000-000000000002"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "导出" }));

  await waitFor(() => expect(navigateToDocumentExport).toHaveBeenCalledWith(downloadUrl));
});

test("aborts export polling when the document workspace unmounts", async () => {
  vi.useFakeTimers();
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      Response.json({ downloadUrl: null, job: { state: "queued" } }, { status: 202 }),
    );
  vi.stubGlobal("fetch", fetchMock);
  const rendered = renderWithIntl(
    <TeachingDocumentWorkspaceView
      artifact={readyArtifact}
      conversationId="00000000-0000-4000-8000-000000000001"
      draft={null}
      failureCode={null}
      onArtifactUpdated={vi.fn()}
      onBack={vi.fn()}
      onSuggestion={vi.fn()}
      pendingTitle={null}
      phase="ready"
      workspaceId="00000000-0000-4000-8000-000000000002"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "导出" }));
  await act(async () => undefined);
  const signal = fetchMock.mock.calls[0]?.[1]?.signal as AbortSignal;
  expect(signal.aborted).toBe(false);

  rendered.unmount();
  expect(signal.aborted).toBe(true);
});
