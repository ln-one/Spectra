import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import type { ArtifactDetail } from "@/features/artifacts/contract";
import type { TeachingDocumentFocus } from "@/features/artifacts/documents/refine";
import type { TeachingDocumentArtifact } from "@/features/artifacts/documents/types";
import type { TeachingDocumentEditProposal } from "@/features/artifacts/proposal-contract";
import { ArtifactDetailError } from "@/features/artifacts/workbench-client";
import { renderWithIntl } from "../../../../tests/render";
import { workbenchVisualFixture } from "./fixture";
import type { ArtifactStreamEvent, UserMessageSurfaceSnapshot } from "./WorkbenchChatRuntime";

const testState = vi.hoisted(() => ({
  emitDocumentEvent: null as ((event: unknown) => void) | null,
  emitProposal: null as ((proposal: TeachingDocumentEditProposal) => void) | null,
  createUserMessage: null as ((snapshot: UserMessageSurfaceSnapshot) => void) | null,
  fetchArtifactDetail: null as
    | ((input: {
        artifactId: string;
        conversationId: string;
        workspaceId: string;
      }) => Promise<ArtifactDetail>)
    | null,
  openArtifact: null as ((artifactId: string) => void) | null,
  push: vi.fn(),
  replace: vi.fn(),
  searchParams: "",
  transitionUpdateResult: undefined as unknown,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: testState.push, replace: testState.replace }),
  useSearchParams: () => new URLSearchParams(testState.searchParams),
}));

vi.mock("@/features/artifacts/workbench-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/artifacts/workbench-client")>();
  return {
    ...actual,
    fetchArtifactDetail: (input: Parameters<typeof actual.fetchArtifactDetail>[0]) =>
      testState.fetchArtifactDetail?.(input) ?? actual.fetchArtifactDetail(input),
  };
});

vi.mock("./WorkspaceHeaderView", () => ({
  WorkspaceHeaderView: () => <div data-testid="workspace-header" />,
}));

vi.mock("./ChatPanelView", () => ({
  ChatPanelView: (props: {
    onArtifactEvent?: (event: ArtifactStreamEvent) => void;
    onArtifactProposal?: (proposal: TeachingDocumentEditProposal) => void;
    onOpenArtifact?: (artifactId: string) => void;
    onUserMessageCreated?: (snapshot: UserMessageSurfaceSnapshot) => void;
    artifactSelection?: TeachingDocumentFocus | null;
  }) => {
    testState.emitDocumentEvent = (event) => props.onArtifactEvent?.(event as ArtifactStreamEvent);
    testState.openArtifact = (artifactId) => props.onOpenArtifact?.(artifactId);
    testState.createUserMessage = (snapshot) => props.onUserMessageCreated?.(snapshot);
    testState.emitProposal = (proposal) => props.onArtifactProposal?.(proposal);
    return (
      <div data-focus={props.artifactSelection ? "selected" : "clear"} data-testid="chat-panel" />
    );
  },
}));

vi.mock("./StudioPanelView", () => ({
  StudioPanelView: (props: {
    artifactHistory: readonly { generationState: string; id: string; title: string }[];
    onSelectTool: (toolId: string) => void;
  }) => (
    <div>
      <button type="button" onClick={() => props.onSelectTool("teaching-document")}>
        Open teaching document
      </button>
      <button type="button" onClick={() => props.onSelectTool("mind-map")}>
        Open mind map
      </button>
      {props.artifactHistory.map((artifact) => (
        <span
          className={artifact.generationState === "queued" ? "animate-spin" : undefined}
          data-testid={`history-${artifact.id}`}
          key={artifact.id}
        >
          {artifact.title}
        </span>
      ))}
    </div>
  ),
}));

vi.mock("./TeachingDocumentWorkspaceView", () => ({
  TeachingDocumentWorkspaceView: (props: {
    artifact: TeachingDocumentArtifact | null;
    focus?: TeachingDocumentFocus | null;
    onBack: () => void;
    onFocusChange?: (focus: TeachingDocumentFocus | null) => void;
    phase: string;
    proposal?: TeachingDocumentEditProposal | null;
  }) => (
    <div>
      <span>{props.phase}</span>
      <span data-testid="document-focus">{props.focus ? "selected" : "clear"}</span>
      <span data-testid="document-proposal">{props.proposal ? "proposal" : "none"}</span>
      <button
        type="button"
        onClick={() =>
          props.artifact &&
          props.onFocusChange?.({
            blockIds: ["selected-list"],
            kind: "teaching_document_blocks",
            revisionId: props.artifact.currentRevision.id,
            selectedText: "数学信任、经济激励、博弈论机制、代码透明",
          })
        }
      >
        Select document text
      </button>
      <button type="button" onClick={props.onBack}>
        Back to studio
      </button>
    </div>
  ),
}));

vi.mock("./MindMapWorkspaceView", () => ({
  MindMapWorkspaceView: (props: { onBack: () => void; phase: string }) => (
    <div>
      <span data-testid="mind-map-phase">{props.phase}</span>
      <button type="button" onClick={props.onBack}>
        Back from mind map
      </button>
    </div>
  ),
}));

vi.mock("./ArtifactWorkbenchPanelLayout", () => ({
  ArtifactWorkbenchPanelLayout: (props: {
    artifact: ReactNode;
    assistant: ReactNode;
    layoutMode: "compose" | "preview";
    sources: ReactNode;
  }) => (
    <div>
      <span data-testid="artifact-layout-mode">{props.layoutMode}</span>
      {props.artifact}
      {props.assistant}
      {props.sources}
    </div>
  ),
}));

vi.mock("./WorkbenchPanelLayout", () => ({
  WorkbenchPanelLayout: (props: {
    chat: ReactNode;
    sources: ReactNode;
    studio: (controls: {
      collapse: () => void;
      collapsed: boolean;
      expand: () => void;
      historyFocusRequest: number;
      showHistory: () => void;
    }) => ReactNode;
  }) => (
    <div>
      {props.studio({
        collapse: vi.fn(),
        collapsed: false,
        expand: vi.fn(),
        historyFocusRequest: 0,
        showHistory: vi.fn(),
      })}
      {props.chat}
      {props.sources}
    </div>
  ),
}));

import { startWorkbenchViewTransition, WorkbenchView } from "./WorkbenchView";

beforeEach(() => {
  testState.emitDocumentEvent = null;
  testState.emitProposal = null;
  testState.createUserMessage = null;
  testState.fetchArtifactDetail = null;
  testState.openArtifact = null;
  testState.push.mockReset();
  testState.replace.mockReset();
  testState.searchParams = "";
  testState.transitionUpdateResult = undefined;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({ matches: false })),
  });
  Object.defineProperty(document, "startViewTransition", {
    configurable: true,
    value: vi.fn((update: () => unknown) => {
      testState.transitionUpdateResult = update();
      return { finished: Promise.resolve() };
    }),
  });
});

test("consumes every rejected lifecycle promise when Chrome aborts a view transition", async () => {
  const update = vi.fn();
  Object.defineProperty(document, "startViewTransition", {
    configurable: true,
    value: vi.fn((callback: () => unknown) => {
      callback();
      const aborted = () =>
        Promise.reject(new DOMException("Transition was aborted because of invalid state"));
      return {
        finished: aborted(),
        ready: aborted(),
        updateCallbackDone: aborted(),
      };
    }),
  });

  startWorkbenchViewTransition(update);
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(update).toHaveBeenCalledOnce();
});

test("keeps selection after sending and clears it only when the matching proposal arrives", () => {
  const artifactId = "00000000-0000-4000-8000-000000000701";
  const revisionId = "00000000-0000-4000-8000-000000000702";
  const workspaceId = "00000000-0000-4000-8000-000000000003";
  const artifact: TeachingDocumentArtifact = {
    createdAt: "2026-07-21T00:00:00.000Z",
    currentRevision: {
      artifactId,
      content: {
        document: { content: [], type: "doc" },
        generation: { outcome: "complete", rawOutput: "", warnings: [] },
        schemaVersion: 2,
        sourceMarkdown: "",
        title: "Focused document",
      },
      contentSha256: "a".repeat(64),
      createdAt: "2026-07-21T00:00:00.000Z",
      id: revisionId,
      parentRevisionId: null,
      revisionNumber: 1,
    },
    id: artifactId,
    title: "Focused document",
    updatedAt: "2026-07-21T00:00:00.000Z",
    workspaceId,
  };
  testState.searchParams = `artifact=${artifactId}`;
  renderWithIntl(
    <WorkbenchView
      fixture={workbenchVisualFixture}
      initialArtifact={{
        artifact,
        createdAt: artifact.createdAt,
        draft: null,
        failureCode: null,
        generationAttemptId: null,
        generationSequence: 1,
        generationState: "ready",
        id: artifactId,
        kind: "teaching_document",
        title: artifact.title,
        updatedAt: artifact.updatedAt,
        workspaceId,
      }}
      initialArtifactHistory={[]}
      accountMenu={null}
      conversationId="00000000-0000-4000-8000-000000000001"
      conversations={[]}
      deleteThreadAction={async () => null}
      newConversationId="00000000-0000-4000-8000-000000000002"
      onThreadTitle={vi.fn()}
      renameThreadAction={async () => null}
      settingsAction={async () => null}
      settingsControl={null}
      sourcesPanel={<div data-testid="sources-panel" />}
      workspaceHref="/developer/course-notes"
      workspaceId={workspaceId}
      workspaceSlug="course-notes"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Select document text" }));
  expect(screen.getByTestId("document-focus")).toHaveTextContent("selected");
  act(() =>
    testState.createUserMessage?.({
      id: "user:focused-revision",
      surface: {
        artifactId,
        focus: {
          blockIds: ["selected-list"],
          kind: "teaching_document_blocks",
          revisionId,
          selectedText: "数学信任、经济激励、博弈论机制、代码透明",
        },
        revisionId,
        type: "artifact_detail",
      },
    }),
  );
  expect(screen.getByTestId("document-focus")).toHaveTextContent("selected");
  expect(screen.getByTestId("chat-panel")).toHaveAttribute("data-focus", "selected");

  act(() =>
    testState.emitProposal?.({
      artifactId,
      baseRevisionId: revisionId,
      edits: [
        {
          blockId: "selected-list",
          operation: "replace_block",
          replacementMarkdown: "改写后的四种信任机制",
        },
      ],
      kind: "teaching_document",
      request: "改写选中内容",
      runId: "00000000-0000-4000-8000-000000000703",
      summary: "改写选中列表",
      title: artifact.title,
    }),
  );
  expect(screen.getByTestId("document-focus")).toHaveTextContent("clear");
  expect(screen.getByTestId("document-proposal")).toHaveTextContent("proposal");
});

test("keeps a clicked document card from being replaced by a concurrent map start", async () => {
  const documentId = "00000000-0000-4000-8000-000000000901";
  const mapId = "00000000-0000-4000-8000-000000000902";
  const workspaceId = "00000000-0000-4000-8000-000000000003";
  let resolveDocument: ((detail: ArtifactDetail) => void) | null = null;
  testState.fetchArtifactDetail = () =>
    new Promise<ArtifactDetail>((resolve) => {
      resolveDocument = resolve;
    });
  renderWithIntl(
    <WorkbenchView
      fixture={workbenchVisualFixture}
      initialArtifact={null}
      initialArtifactHistory={[]}
      accountMenu={null}
      conversationId="00000000-0000-4000-8000-000000000001"
      conversations={[]}
      deleteThreadAction={async () => null}
      newConversationId="00000000-0000-4000-8000-000000000002"
      onThreadTitle={vi.fn()}
      renameThreadAction={async () => null}
      settingsAction={async () => null}
      settingsControl={null}
      sourcesPanel={<div data-testid="sources-panel" />}
      workspaceHref="/developer/course-notes"
      workspaceId={workspaceId}
      workspaceSlug="course-notes"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Open mind map" }));
  act(() =>
    testState.createUserMessage?.({
      id: "user:new-map",
      surface: { kind: "mind_map", type: "artifact_start" },
    }),
  );
  act(() => testState.openArtifact?.(documentId));
  act(() =>
    testState.emitDocumentEvent?.({
      detail: {
        artifact: null,
        createdAt: "2026-07-20T00:00:00.000Z",
        draft: null,
        failureCode: null,
        generationAttemptId: null,
        generationSequence: 0,
        generationState: "queued",
        id: mapId,
        kind: "mind_map",
        title: "Concurrent map",
        updatedAt: "2026-07-20T00:00:00.000Z",
        workspaceId,
      },
      sourceUserMessageId: "user:new-map",
      type: "started",
    }),
  );
  expect(testState.replace).not.toHaveBeenCalledWith(
    expect.stringContaining(`artifact=${mapId}`),
    expect.anything(),
  );

  await act(async () => {
    resolveDocument?.({
      artifact: null,
      createdAt: "2026-07-20T00:00:00.000Z",
      draft: null,
      failureCode: null,
      generationAttemptId: null,
      generationSequence: 0,
      generationState: "queued",
      id: documentId,
      kind: "teaching_document",
      title: "Chosen document",
      updatedAt: "2026-07-20T00:00:00.000Z",
      workspaceId,
    });
  });
  expect(testState.push).toHaveBeenCalledWith(
    `/developer/course-notes?conversation=00000000-0000-4000-8000-000000000001&artifact=${documentId}`,
    { scroll: false },
  );
});

test("opens a ready Presentation in the Artifact Workbench", async () => {
  const presentationId = "00000000-0000-4000-8000-000000000911";
  const workspaceId = "00000000-0000-4000-8000-000000000003";
  testState.fetchArtifactDetail = async () => ({
    artifact: {
      createdAt: "2026-07-29T00:00:00.000Z",
      currentRevision: {
        artifactId: presentationId,
        content: {
          pageCount: 1,
          pageTitles: ["Cover"],
          schemaVersion: 1,
          summary: "Summary",
          title: "Ready presentation",
        },
        contentSha256: "a".repeat(64),
        createdAt: "2026-07-29T00:00:00.000Z",
        id: "00000000-0000-4000-8000-000000000912",
        parentRevisionId: null,
        revisionNumber: 1,
      },
      groundingSources: [],
      id: presentationId,
      title: "Ready presentation",
      updatedAt: "2026-07-29T00:00:00.000Z",
      workspaceId,
    },
    createdAt: "2026-07-29T00:00:00.000Z",
    failureCode: null,
    generationAttemptId: null,
    generationDraft: null,
    generationSequence: 1,
    generationState: "ready",
    id: presentationId,
    kind: "presentation",
    title: "Ready presentation",
    updatedAt: "2026-07-29T00:00:00.000Z",
    workspaceId,
  });
  renderWithIntl(
    <WorkbenchView
      fixture={workbenchVisualFixture}
      initialArtifact={null}
      initialArtifactHistory={[]}
      accountMenu={null}
      conversationId="00000000-0000-4000-8000-000000000001"
      conversations={[]}
      deleteThreadAction={async () => null}
      newConversationId="00000000-0000-4000-8000-000000000002"
      onThreadTitle={vi.fn()}
      renameThreadAction={async () => null}
      settingsAction={async () => null}
      settingsControl={null}
      sourcesPanel={<div data-testid="sources-panel" />}
      workspaceHref="/developer/course-notes"
      workspaceId={workspaceId}
      workspaceSlug="course-notes"
    />,
  );

  act(() => testState.openArtifact?.(presentationId));

  await waitFor(() =>
    expect(testState.push).toHaveBeenCalledWith(
      `/developer/course-notes?conversation=00000000-0000-4000-8000-000000000001&artifact=${presentationId}`,
      { scroll: false },
    ),
  );
  expect(screen.getByTestId("presentation-workspace")).toBeVisible();
});

test("promotes selected ready detail into stale History immediately", async () => {
  const artifactId = "00000000-0000-4000-8000-000000000019";
  const revisionId = "00000000-0000-4000-8000-000000000020";
  const workspaceId = "00000000-0000-4000-8000-000000000003";
  testState.searchParams = `artifact=${artifactId}`;
  const artifact = {
    createdAt: "2026-07-19T10:00:00.000Z",
    currentRevision: {
      artifactId,
      content: {
        document: { content: [], type: "doc" as const },
        generation: { outcome: "complete" as const, rawOutput: "", warnings: [] },
        schemaVersion: 2 as const,
        sourceMarkdown: "",
        title: "Finished document",
      },
      contentSha256: "a".repeat(64),
      createdAt: "2026-07-19T10:01:00.000Z",
      id: revisionId,
      parentRevisionId: null,
      revisionNumber: 1,
    },
    id: artifactId,
    title: "Finished document",
    updatedAt: "2026-07-19T10:01:00.000Z",
    workspaceId,
  };
  renderWithIntl(
    <WorkbenchView
      fixture={workbenchVisualFixture}
      initialArtifact={{
        artifact,
        createdAt: artifact.createdAt,
        draft: null,
        failureCode: null,
        generationAttemptId: null,
        generationSequence: 1,
        generationState: "ready",
        id: artifactId,
        kind: "teaching_document",
        title: artifact.title,
        updatedAt: artifact.updatedAt,
        workspaceId,
      }}
      initialArtifactHistory={[
        {
          createdAt: artifact.createdAt,
          currentRevisionId: null,
          generationState: "queued",
          id: artifactId,
          kind: "teaching_document",
          title: artifact.title,
          updatedAt: artifact.createdAt,
        },
      ]}
      accountMenu={null}
      conversationId="00000000-0000-4000-8000-000000000001"
      conversations={[]}
      deleteThreadAction={async () => null}
      newConversationId="00000000-0000-4000-8000-000000000002"
      onThreadTitle={vi.fn()}
      renameThreadAction={async () => null}
      settingsAction={async () => null}
      settingsControl={null}
      sourcesPanel={<div data-testid="sources-panel" />}
      workspaceHref="/developer/course-notes"
      workspaceId={workspaceId}
      workspaceSlug="course-notes"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Back to studio" }));
  expect(await screen.findByTestId(`history-${artifactId}`)).not.toHaveClass("animate-spin");
});

test("adds an agent-created document to spinning History without opening it", async () => {
  renderWithIntl(
    <WorkbenchView
      fixture={workbenchVisualFixture}
      initialArtifact={null}
      initialArtifactHistory={[]}
      accountMenu={null}
      conversationId="00000000-0000-4000-8000-000000000001"
      conversations={[]}
      deleteThreadAction={async () => null}
      newConversationId="00000000-0000-4000-8000-000000000002"
      onThreadTitle={vi.fn()}
      renameThreadAction={async () => null}
      settingsAction={async () => null}
      settingsControl={null}
      sourcesPanel={<div data-testid="sources-panel" />}
      workspaceHref="/developer/course-notes"
      workspaceId="00000000-0000-4000-8000-000000000003"
      workspaceSlug="course-notes"
    />,
  );

  const detail = {
    artifact: null,
    createdAt: "2026-07-18T00:00:00.000Z",
    draft: null,
    failureCode: null,
    generationState: "queued" as const,
    id: "00000000-0000-4000-8000-000000000009",
    kind: "teaching_document" as const,
    generationAttemptId: null,
    title: "Background document",
    updatedAt: "2026-07-18T00:00:00.000Z",
    workspaceId: "00000000-0000-4000-8000-000000000003",
  };
  act(() => testState.emitDocumentEvent?.({ detail, type: "started" }));

  expect(await screen.findByTestId(`history-${detail.id}`)).toHaveTextContent(
    "Background document",
  );
  expect(screen.getByTestId(`history-${detail.id}`)).toHaveClass("animate-spin");
  expect(screen.queryByRole("button", { name: "Back to studio" })).not.toBeInTheDocument();
  expect(testState.replace).not.toHaveBeenCalled();
});

test("uses refreshed server History instead of retaining a deleted queued Artifact", async () => {
  const artifactId = "00000000-0000-4000-8000-000000000039";
  const workspaceId = "00000000-0000-4000-8000-000000000003";
  const conversationId = "00000000-0000-4000-8000-000000000001";
  const historyItem = {
    createdAt: "2026-07-18T00:00:00.000Z",
    currentRevisionId: null,
    generationState: "queued" as const,
    id: artifactId,
    kind: "mind_map" as const,
    title: "Deleted map",
    updatedAt: "2026-07-18T00:00:00.000Z",
  };
  const workbench = (initialArtifactHistory: readonly (typeof historyItem)[]) => (
    <WorkbenchView
      fixture={workbenchVisualFixture}
      initialArtifact={null}
      initialArtifactHistory={initialArtifactHistory}
      accountMenu={null}
      conversationId={conversationId}
      conversations={[]}
      deleteThreadAction={async () => null}
      newConversationId="00000000-0000-4000-8000-000000000002"
      onThreadTitle={vi.fn()}
      renameThreadAction={async () => null}
      settingsAction={async () => null}
      settingsControl={null}
      sourcesPanel={<div data-testid="sources-panel" />}
      workspaceHref="/developer/course-notes"
      workspaceId={workspaceId}
      workspaceSlug="course-notes"
    />
  );
  const view = renderWithIntl(workbench([historyItem]));
  expect(await screen.findByTestId(`history-${artifactId}`)).toHaveClass("animate-spin");

  view.rerender(workbench([]));

  await waitFor(() => expect(screen.queryByTestId(`history-${artifactId}`)).toBeNull());
});

test("does not restore a deleted Artifact from a persisted chat event", async () => {
  const artifactId = "00000000-0000-4000-8000-000000000049";
  const workspaceId = "00000000-0000-4000-8000-000000000003";
  const fetchDetail = vi.fn(async () => {
    throw new ArtifactDetailError("not_found");
  });
  testState.fetchArtifactDetail = fetchDetail;
  renderWithIntl(
    <WorkbenchView
      fixture={workbenchVisualFixture}
      initialArtifact={null}
      initialArtifactHistory={[]}
      accountMenu={null}
      conversationId="00000000-0000-4000-8000-000000000001"
      conversations={[]}
      deleteThreadAction={async () => null}
      newConversationId="00000000-0000-4000-8000-000000000002"
      onThreadTitle={vi.fn()}
      renameThreadAction={async () => null}
      settingsAction={async () => null}
      settingsControl={null}
      sourcesPanel={<div data-testid="sources-panel" />}
      workspaceHref="/developer/course-notes"
      workspaceId={workspaceId}
      workspaceSlug="course-notes"
    />,
  );

  act(() =>
    testState.emitDocumentEvent?.({
      detail: {
        artifact: null,
        createdAt: "2026-07-18T00:00:00.000Z",
        draft: null,
        failureCode: null,
        generationAttemptId: null,
        generationSequence: 0,
        generationState: "queued",
        id: artifactId,
        kind: "mind_map",
        title: "Deleted map",
        updatedAt: "2026-07-18T00:00:00.000Z",
        workspaceId,
      },
      replayedFromHistory: true,
      type: "started",
    }),
  );

  await waitFor(() => expect(fetchDetail).toHaveBeenCalledOnce());
  expect(screen.queryByTestId(`history-${artifactId}`)).toBeNull();
});

test("does not restore a Source Artifact to History from a persisted chat event", async () => {
  const artifactId = "00000000-0000-4000-8000-000000000059";
  const revisionId = "00000000-0000-4000-8000-000000000060";
  const workspaceId = "00000000-0000-4000-8000-000000000003";
  const detail: ArtifactDetail = {
    artifact: {
      createdAt: "2026-07-18T00:00:00.000Z",
      currentRevision: {
        artifactId,
        content: {
          generation: { outcome: "complete", rawOutput: "{}", warnings: [] },
          nodes: [{ id: "root", label: "Published map", order: 0, parentId: null }],
          rootId: "root",
          schemaVersion: 2,
        },
        contentSha256: "a".repeat(64),
        createdAt: "2026-07-18T00:10:00.000Z",
        id: revisionId,
        parentRevisionId: null,
        revisionNumber: 1,
      },
      id: artifactId,
      title: "Published map",
      updatedAt: "2026-07-18T00:10:00.000Z",
      workspaceId,
    },
    createdAt: "2026-07-18T00:00:00.000Z",
    draft: null,
    failureCode: null,
    generationAttemptId: null,
    generationSequence: 0,
    generationState: "ready",
    id: artifactId,
    kind: "mind_map",
    title: "Published map",
    updatedAt: "2026-07-18T00:10:00.000Z",
    workspaceId,
  };
  const fetchDetail = vi.fn(async () => detail);
  testState.fetchArtifactDetail = fetchDetail;
  renderWithIntl(
    <WorkbenchView
      fixture={workbenchVisualFixture}
      initialArtifact={null}
      initialArtifactHistory={[]}
      accountMenu={null}
      conversationId="00000000-0000-4000-8000-000000000001"
      conversations={[]}
      deleteThreadAction={async () => null}
      newConversationId="00000000-0000-4000-8000-000000000002"
      onThreadTitle={vi.fn()}
      renameThreadAction={async () => null}
      settingsAction={async () => null}
      settingsControl={null}
      sourcesPanel={<div data-testid="sources-panel" />}
      workspaceHref="/developer/course-notes"
      workspaceId={workspaceId}
      workspaceSlug="course-notes"
    />,
  );

  act(() =>
    testState.emitDocumentEvent?.({
      detail,
      replayedFromHistory: true,
      type: "started",
    }),
  );

  await waitFor(() => expect(fetchDetail).toHaveBeenCalledOnce());
  expect(screen.queryByTestId(`history-${artifactId}`)).toBeNull();
});

test("does not replay a persisted queued start over ready server History", async () => {
  const artifactId = "00000000-0000-4000-8000-000000000029";
  renderWithIntl(
    <WorkbenchView
      fixture={workbenchVisualFixture}
      initialArtifact={null}
      initialArtifactHistory={[
        {
          createdAt: "2026-07-18T00:00:00.000Z",
          currentRevisionId: "00000000-0000-4000-8000-000000000030",
          generationState: "ready",
          id: artifactId,
          kind: "teaching_document",
          title: "Ready document",
          updatedAt: "2026-07-18T00:10:00.000Z",
        },
      ]}
      accountMenu={null}
      conversationId="00000000-0000-4000-8000-000000000001"
      conversations={[]}
      deleteThreadAction={async () => null}
      newConversationId="00000000-0000-4000-8000-000000000002"
      onThreadTitle={vi.fn()}
      renameThreadAction={async () => null}
      settingsAction={async () => null}
      settingsControl={null}
      sourcesPanel={<div data-testid="sources-panel" />}
      workspaceHref="/developer/course-notes"
      workspaceId="00000000-0000-4000-8000-000000000003"
      workspaceSlug="course-notes"
    />,
  );

  act(() =>
    testState.emitDocumentEvent?.({
      detail: {
        artifact: null,
        createdAt: "2026-07-18T00:00:00.000Z",
        draft: null,
        failureCode: null,
        generationAttemptId: null,
        generationSequence: 0,
        generationState: "queued",
        id: artifactId,
        kind: "teaching_document",
        title: "Ready document",
        updatedAt: "2026-07-18T00:00:00.000Z",
        workspaceId: "00000000-0000-4000-8000-000000000003",
      },
      type: "started",
    }),
  );

  expect(await screen.findByTestId(`history-${artifactId}`)).not.toHaveClass("animate-spin");
});

test("does not reopen the document workspace when generation events arrive after exit", () => {
  const { container } = renderWithIntl(
    <WorkbenchView
      fixture={workbenchVisualFixture}
      initialArtifact={null}
      initialArtifactHistory={[]}
      accountMenu={null}
      conversationId="00000000-0000-4000-8000-000000000001"
      conversations={[]}
      deleteThreadAction={async () => null}
      newConversationId="00000000-0000-4000-8000-000000000002"
      onThreadTitle={vi.fn()}
      renameThreadAction={async () => null}
      settingsAction={async () => null}
      settingsControl={null}
      sourcesPanel={<div data-testid="sources-panel" />}
      workspaceHref="/developer/course-notes"
      workspaceId="00000000-0000-4000-8000-000000000003"
      workspaceSlug="course-notes"
    />,
  );

  const workspaceRoot = container.querySelector("[data-workspace-theme]");
  expect(workspaceRoot).toHaveAttribute("data-studio-tone", "neutral");
  fireEvent.click(screen.getByRole("button", { name: "Open teaching document" }));
  act(() =>
    testState.createUserMessage?.({
      id: "user:new-document",
      surface: { kind: "teaching_document", type: "artifact_start" },
    }),
  );
  expect(workspaceRoot).toHaveAttribute("data-studio-tone", "blue");
  expect(screen.getByTestId("artifact-layout-mode")).toHaveTextContent("compose");
  expect(testState.transitionUpdateResult).toBeUndefined();
  const detail = {
    artifact: null,
    createdAt: "2026-07-18T00:00:00.000Z",
    draft: null,
    failureCode: null,
    generationState: "queued",
    id: "00000000-0000-4000-8000-000000000009",
    kind: "teaching_document",
    title: "New document",
    updatedAt: "2026-07-18T00:00:00.000Z",
    workspaceId: "00000000-0000-4000-8000-000000000003",
  };
  act(() =>
    testState.emitDocumentEvent?.({
      detail,
      sourceUserMessageId: "user:new-document",
      type: "started",
    }),
  );
  expect(screen.getByText("generating")).toBeInTheDocument();
  expect(screen.getByTestId("artifact-layout-mode")).toHaveTextContent("preview");

  fireEvent.click(screen.getByRole("button", { name: "Back to studio" }));
  expect(workspaceRoot).toHaveAttribute("data-studio-tone", "neutral");
  expect(screen.getByRole("button", { name: "Open teaching document" })).toBeInTheDocument();

  act(() => testState.emitDocumentEvent?.({ detail, type: "started" }));
  expect(workspaceRoot).toHaveAttribute("data-studio-tone", "neutral");
  expect(screen.queryByRole("button", { name: "Back to studio" })).not.toBeInTheDocument();
  expect(testState.replace).toHaveBeenLastCalledWith(
    "/developer/course-notes?conversation=00000000-0000-4000-8000-000000000001",
    { scroll: false },
  );
});

test("does not mistake a remounted historical map card for the newly requested map", async () => {
  const oldArtifactId = "00000000-0000-4000-8000-000000000801";
  const newArtifactId = "00000000-0000-4000-8000-000000000802";
  renderWithIntl(
    <WorkbenchView
      fixture={workbenchVisualFixture}
      initialArtifact={null}
      initialArtifactHistory={[
        {
          createdAt: "2026-07-19T10:00:00.000Z",
          currentRevisionId: "00000000-0000-4000-8000-000000000803",
          generationState: "ready",
          id: oldArtifactId,
          kind: "mind_map",
          title: "Old map",
          updatedAt: "2026-07-19T10:01:00.000Z",
        },
      ]}
      accountMenu={null}
      conversationId="00000000-0000-4000-8000-000000000001"
      conversations={[]}
      deleteThreadAction={async () => null}
      newConversationId="00000000-0000-4000-8000-000000000002"
      onThreadTitle={vi.fn()}
      renameThreadAction={async () => null}
      settingsAction={async () => null}
      settingsControl={null}
      sourcesPanel={<div data-testid="sources-panel" />}
      workspaceHref="/developer/course-notes"
      workspaceId="00000000-0000-4000-8000-000000000003"
      workspaceSlug="course-notes"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Open mind map" }));
  act(() =>
    testState.createUserMessage?.({
      id: "user:new-map",
      surface: { kind: "mind_map", type: "artifact_start" },
    }),
  );
  expect(await screen.findByTestId("mind-map-phase")).toHaveTextContent("idle");
  act(() =>
    testState.emitDocumentEvent?.({
      detail: {
        artifact: null,
        createdAt: "2026-07-19T10:00:00.000Z",
        draft: null,
        failureCode: null,
        generationAttemptId: null,
        generationSequence: 0,
        generationState: "ready",
        id: oldArtifactId,
        kind: "mind_map",
        title: "Old map",
        updatedAt: "2026-07-19T10:01:00.000Z",
        workspaceId: "00000000-0000-4000-8000-000000000003",
      },
      sourceUserMessageId: "user:old-map",
      type: "started",
    }),
  );
  expect(screen.getByTestId("mind-map-phase")).toHaveTextContent("idle");
  expect(testState.replace).not.toHaveBeenCalled();

  act(() =>
    testState.emitDocumentEvent?.({
      detail: {
        artifact: null,
        createdAt: "2026-07-19T10:02:00.000Z",
        draft: null,
        failureCode: null,
        generationAttemptId: null,
        generationSequence: 0,
        generationState: "queued",
        id: newArtifactId,
        kind: "mind_map",
        title: "New map",
        updatedAt: "2026-07-19T10:02:00.000Z",
        workspaceId: "00000000-0000-4000-8000-000000000003",
      },
      sourceUserMessageId: "user:new-map",
      type: "started",
    }),
  );
  expect(screen.getByTestId("mind-map-phase")).toHaveTextContent("generating");
  expect(testState.replace).toHaveBeenLastCalledWith(
    `/developer/course-notes?conversation=00000000-0000-4000-8000-000000000001&artifact=${newArtifactId}`,
    { scroll: false },
  );
});
