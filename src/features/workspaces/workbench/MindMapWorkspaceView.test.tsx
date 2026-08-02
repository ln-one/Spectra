import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { type ComponentType, type ReactNode, useState } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import type { MindMapRevisionContent } from "@/features/artifacts/mind-maps/contract";
import type { MindMapArtifact } from "@/features/artifacts/mind-maps/types";
import type { MindMapEditProposal } from "@/features/artifacts/proposal-contract";
import { renderWithIntl } from "../../../../tests/render";
import { MindMapWorkspaceView } from "./MindMapWorkspaceView";

vi.mock("@xyflow/react", () => ({
  Background: () => null,
  BackgroundVariant: { Dots: "dots" },
  BaseEdge: () => null,
  Controls: () => null,
  Handle: () => null,
  NodeToolbar: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Position: { Left: "left", Right: "right", Top: "top" },
  ReactFlow: ({
    nodeTypes,
    nodes,
    onNodeClick,
  }: {
    nodeTypes: Record<
      string,
      ComponentType<{
        data: { label: string };
        id: string;
        selected: boolean;
      }>
    >;
    nodes: Array<{
      data: { label: string };
      id: string;
      selected?: boolean;
      type: string;
    }>;
    onNodeClick: (event: Event, node: { id: string }) => void;
  }) => (
    <div>
      {nodes.map((node) => {
        const Component = nodeTypes[node.type];
        return (
          <div
            key={node.id}
            data-testid={`flow-node-${node.id}`}
            onClick={(event) => onNodeClick(event.nativeEvent, node)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onNodeClick(event.nativeEvent, node);
            }}
            role="treeitem"
            tabIndex={0}
          >
            {Component ? (
              <Component data={node.data} id={node.id} selected={Boolean(node.selected)} />
            ) : (
              node.data.label
            )}
          </div>
        );
      })}
    </div>
  ),
  ReactFlowProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  getBezierPath: () => [""],
}));

const workspaceId = "00000000-0000-4000-8000-000000000001";
const artifactId = "00000000-0000-4000-8000-000000000002";
const firstRevisionId = "00000000-0000-4000-8000-000000000003";
const secondRevisionId = "00000000-0000-4000-8000-000000000004";
const generation = { outcome: "complete" as const, rawOutput: "{}", warnings: [] };
const content: MindMapRevisionContent = {
  generation,
  nodes: [{ id: "root", label: "Persistent map", order: 0, parentId: null }],
  rootId: "root",
  schemaVersion: 2 as const,
};

function artifact(
  revisionId: string,
  revisionNumber: number,
  contentValue: MindMapRevisionContent = content,
): MindMapArtifact {
  return {
    createdAt: "2026-07-19T01:00:00.000Z",
    currentRevision: {
      artifactId,
      content: contentValue,
      contentSha256: "a".repeat(64),
      createdAt: "2026-07-19T01:00:00.000Z",
      id: revisionId,
      parentRevisionId: revisionNumber === 1 ? null : firstRevisionId,
      revisionNumber,
    },
    id: artifactId,
    title: "Persistent map",
    updatedAt: "2026-07-19T01:00:00.000Z",
    workspaceId,
  };
}

const localViewStorage = new Map<string, string>();

beforeEach(() => {
  localViewStorage.clear();
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => localViewStorage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => localViewStorage.set(key, value)),
  });
});

function view(artifactValue: MindMapArtifact, onBack = vi.fn(), onArtifactUpdated = vi.fn()) {
  return (
    <MindMapWorkspaceView
      artifact={artifactValue}
      conversationId="00000000-0000-4000-8000-000000000005"
      draft={null}
      failureCode={null}
      onArtifactUpdated={onArtifactUpdated}
      onBack={onBack}
      onSuggestion={vi.fn()}
      pendingTitle={null}
      phase="idle"
      workspaceId={workspaceId}
    />
  );
}

function blankView(onSuggestion = vi.fn()) {
  return (
    <MindMapWorkspaceView
      artifact={null}
      conversationId="00000000-0000-4000-8000-000000000005"
      draft={null}
      failureCode={null}
      onArtifactUpdated={vi.fn()}
      onBack={vi.fn()}
      onSuggestion={onSuggestion}
      pendingTitle={null}
      phase="idle"
      workspaceId={workspaceId}
    />
  );
}

test("loads Mind Map suggestions dynamically through the shared Artifact endpoint", async () => {
  const suggestions = Array.from({ length: 4 }, (_, index) => ({
    prompt: `Mind map prompt ${index}`,
    title: `Mind map suggestion ${index}`,
  }));
  const fetchMock = vi.fn(async () => Response.json({ status: "fresh", suggestions }));
  vi.stubGlobal("fetch", fetchMock);
  const onSuggestion = vi.fn();

  renderWithIntl(blankView(onSuggestion));

  expect(screen.getAllByTestId("suggestion-card-skeleton")).toHaveLength(4);
  const suggestion = await screen.findByRole("button", { name: /Mind map suggestion 0/ });
  expect(fetchMock).toHaveBeenCalledWith(
    `/api/artifacts/suggestions?locale=zh-CN&target=mind_map&view=artifact-v1&workspaceId=${workspaceId}`,
  );
  expect(screen.getByRole("button", { name: "重新生成建议" })).toBeInTheDocument();
  fireEvent.click(suggestion);
  expect(onSuggestion).toHaveBeenCalledWith("Mind map prompt 0");
});

test("explains added nodes by parent and accepts the persisted proposal response", async () => {
  const proposedContent: MindMapRevisionContent = {
    nodes: [
      ...content.nodes,
      { id: "child", label: "Proposed child", order: 0, parentId: "root" },
      { id: "grandchild", label: "Proposed grandchild", order: 0, parentId: "child" },
    ],
    rootId: "root",
    generation,
    schemaVersion: 2,
  };
  const proposal: MindMapEditProposal = {
    artifactId,
    baseRevisionId: firstRevisionId,
    content: proposedContent,
    edits: [
      {
        levels: 2,
        nodes: [
          { key: "child", label: "Proposed child", note: "", parentKey: null },
          {
            key: "grandchild",
            label: "Proposed grandchild",
            note: "",
            parentKey: "child",
          },
        ],
        parentId: "root",
        type: "add_tree",
      },
    ],
    kind: "mind_map",
    request: "Add a child",
    runId: "00000000-0000-4000-8000-000000000006",
    summary: "Add one explanatory branch",
    title: "Persistent map",
  };
  const updatedArtifact = artifact(secondRevisionId, 2, proposedContent);
  const onArtifactUpdated = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ acceptedRevisionId: secondRevisionId, artifact: updatedArtifact }),
    ),
  );

  function ProposalHarness() {
    const [currentArtifact, setCurrentArtifact] = useState(artifact(firstRevisionId, 1));
    const [currentProposal, setCurrentProposal] = useState<MindMapEditProposal | null>(proposal);
    return (
      <MindMapWorkspaceView
        artifact={currentArtifact}
        conversationId="00000000-0000-4000-8000-000000000005"
        draft={null}
        failureCode={null}
        onArtifactUpdated={(next) => {
          onArtifactUpdated(next);
          setCurrentArtifact(next);
        }}
        onBack={vi.fn()}
        onProposalDismiss={() => setCurrentProposal(null)}
        onSuggestion={vi.fn()}
        pendingTitle={null}
        phase="idle"
        proposal={currentProposal}
        workspaceId={workspaceId}
      />
    );
  }

  renderWithIntl(<ProposalHarness />);

  expect(screen.getByText("预览 2 项 AI 更改")).toBeInTheDocument();
  expect(screen.getByText("Proposed child")).toBeInTheDocument();
  expect(screen.getAllByText("＋新增")).toHaveLength(2);
  const rootElement = screen.getByTestId("flow-node-root");
  fireEvent.click(screen.getByRole("button", { name: /预览 2 项 AI 更改/ }));
  expect(screen.getByText("在“Persistent map”分支新增 2 个节点")).toBeInTheDocument();
  expect(screen.getByText("Proposed child › Proposed grandchild")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "应用更改" }));

  await waitFor(() => expect(onArtifactUpdated).toHaveBeenCalledWith(updatedArtifact));
  await waitFor(() => expect(screen.queryByText("＋新增")).not.toBeInTheDocument());
  expect(screen.getByTestId("flow-node-root")).toBe(rootElement);
  expect(screen.getByText("Proposed child")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("reveals additions inside an auto-collapsed branch and keeps them visible after acceptance", async () => {
  const crowdedContent: MindMapRevisionContent = {
    nodes: [
      { id: "root", label: "Crowded map", order: 0, parentId: null },
      { id: "branch", label: "Branch", order: 0, parentId: "root" },
      { id: "target", label: "Definition", order: 0, parentId: "branch" },
      { id: "crowded", label: "Crowded section", order: 1, parentId: "branch" },
      ...Array.from({ length: 23 }, (_, index) => ({
        id: `existing-${index}`,
        label: `Existing leaf ${index}`,
        order: index,
        parentId: "crowded",
      })),
    ],
    rootId: "root",
    generation,
    schemaVersion: 2,
  };
  const proposedContent: MindMapRevisionContent = {
    ...crowdedContent,
    nodes: [
      ...crowdedContent.nodes,
      { id: "new-child", label: "New branch", order: 0, parentId: "target" },
      { id: "new-grandchild", label: "New detail", order: 0, parentId: "new-child" },
    ],
  };
  const proposal: MindMapEditProposal = {
    artifactId,
    baseRevisionId: firstRevisionId,
    content: proposedContent,
    edits: [
      {
        levels: 2,
        nodes: [
          { key: "new-child", label: "New branch", note: "", parentKey: null },
          {
            key: "new-grandchild",
            label: "New detail",
            note: "",
            parentKey: "new-child",
          },
        ],
        parentId: "target",
        type: "add_tree",
      },
    ],
    kind: "mind_map",
    request: "Extend Definition",
    runId: "00000000-0000-4000-8000-000000000006",
    summary: "Add two levels",
    title: "Crowded map",
  };
  const updatedArtifact = artifact(secondRevisionId, 2, proposedContent);
  const onArtifactUpdated = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ acceptedRevisionId: secondRevisionId, artifact: updatedArtifact }),
    ),
  );

  function StaleParentHarness() {
    const [currentProposal, setCurrentProposal] = useState<MindMapEditProposal | null>(proposal);
    return (
      <MindMapWorkspaceView
        artifact={artifact(firstRevisionId, 1, crowdedContent)}
        conversationId="00000000-0000-4000-8000-000000000005"
        draft={null}
        failureCode={null}
        onArtifactUpdated={onArtifactUpdated}
        onBack={vi.fn()}
        onProposalDismiss={() => setCurrentProposal(null)}
        onSuggestion={vi.fn()}
        pendingTitle={null}
        phase="idle"
        proposal={currentProposal}
        workspaceId={workspaceId}
      />
    );
  }

  renderWithIntl(<StaleParentHarness />);

  expect(screen.getByText("New branch")).toBeInTheDocument();
  expect(screen.getByText("New detail")).toBeInTheDocument();
  expect(screen.queryByText("Existing leaf 0")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "应用更改" }));

  await waitFor(() => expect(onArtifactUpdated).toHaveBeenCalledWith(updatedArtifact));
  await waitFor(() => expect(screen.queryByText("＋新增")).not.toBeInTheDocument());
  expect(screen.getByText("New branch")).toBeInTheDocument();
  expect(screen.getByText("New detail")).toBeInTheDocument();
});

test("keeps the projected map available when accepting fails", async () => {
  const proposedContent: MindMapRevisionContent = {
    nodes: [...content.nodes, { id: "child", label: "Retry child", order: 0, parentId: "root" }],
    rootId: "root",
    generation,
    schemaVersion: 2,
  };
  const proposal: MindMapEditProposal = {
    artifactId,
    baseRevisionId: firstRevisionId,
    content: proposedContent,
    edits: [{ label: "Retry child", note: "", parentId: "root", type: "add_child" }],
    kind: "mind_map",
    request: "Add a child",
    runId: "00000000-0000-4000-8000-000000000006",
    summary: "Add one branch",
    title: "Persistent map",
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 500 })),
  );

  renderWithIntl(
    <MindMapWorkspaceView
      artifact={artifact(firstRevisionId, 1)}
      conversationId="00000000-0000-4000-8000-000000000005"
      draft={null}
      failureCode={null}
      onArtifactUpdated={vi.fn()}
      onBack={vi.fn()}
      onProposalDismiss={vi.fn()}
      onSuggestion={vi.fn()}
      pendingTitle={null}
      phase="idle"
      proposal={proposal}
      workspaceId={workspaceId}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "应用更改" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("保存失败");
  expect(screen.getByText("Retry child")).toBeInTheDocument();
  expect(screen.getByText("＋新增")).toBeInTheDocument();
});

test("freezes the base revision while an edit is open", async () => {
  const first = artifact(firstRevisionId, 1);
  const second = artifact(secondRevisionId, 2);
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    Response.json({ artifact: second }),
  );
  vi.stubGlobal("fetch", fetchMock);

  const rendered = renderWithIntl(view(first));
  fireEvent.click(screen.getByRole("button", { name: "编辑" }));
  rendered.rerender(view(second));
  fireEvent.click(screen.getByRole("button", { name: "保存" }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  const request = fetchMock.mock.calls[0]?.[1];
  expect(JSON.parse(String(request?.body))).toMatchObject({ expectedRevisionId: firstRevisionId });
});

test("locks cancel and back while a save request is pending", async () => {
  const first = artifact(firstRevisionId, 1);
  const second = artifact(secondRevisionId, 2);
  const onBack = vi.fn();
  const onArtifactUpdated = vi.fn();
  let resolveFetch: ((response: Response) => void) | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    ),
  );

  renderWithIntl(view(first, onBack, onArtifactUpdated));
  fireEvent.click(screen.getByRole("button", { name: "编辑" }));
  fireEvent.click(screen.getByRole("button", { name: "保存" }));

  const cancel = screen.getByRole("button", { name: "取消" });
  const back = screen.getByRole("button", { name: "返回备课工坊" });
  expect(cancel).toBeDisabled();
  expect(back).toBeDisabled();
  fireEvent.click(back);
  expect(onBack).not.toHaveBeenCalled();

  resolveFetch?.(Response.json({ artifact: second }));
  await waitFor(() => expect(onArtifactUpdated).toHaveBeenCalledWith(second));
});

test("uses themed surfaces for the map canvas", () => {
  const { getByTestId } = renderWithIntl(view(artifact(firstRevisionId, 1)));
  expect(getByTestId("mind-map-canvas")).toHaveClass("bg-[var(--workspace-surface-elevated)]");
  expect(getByTestId("mind-map-canvas")).not.toHaveClass("bg-white");
});

test("starts large maps at a complete readable layer and expands a branch without selecting it", async () => {
  const largeContent: MindMapRevisionContent = {
    nodes: [
      { id: "root", label: "Large map", order: 0, parentId: null },
      { id: "a", label: "Branch A", order: 0, parentId: "root" },
      { id: "b", label: "Branch B", order: 1, parentId: "root" },
      ...Array.from({ length: 13 }, (_, index) => ({
        id: `a-${index}`,
        label: `Leaf A ${index}`,
        order: index,
        parentId: "a",
      })),
      ...Array.from({ length: 13 }, (_, index) => ({
        id: `b-${index}`,
        label: `Leaf B ${index}`,
        order: index,
        parentId: "b",
      })),
    ],
    rootId: "root",
    generation,
    schemaVersion: 2,
  };

  renderWithIntl(view(artifact(firstRevisionId, 1, largeContent)));
  await waitFor(() => expect(screen.getAllByRole("button", { name: "展开分支" })).toHaveLength(2));
  expect(screen.queryByText("Leaf A 0")).not.toBeInTheDocument();
  const firstExpandButton = screen.getAllByRole("button", { name: "展开分支" })[0];
  expect(firstExpandButton).toBeDefined();
  if (!firstExpandButton) throw new Error("Missing first branch expand button");
  fireEvent.click(firstExpandButton);
  expect(await screen.findByText("Leaf A 0")).toBeInTheDocument();
  expect(screen.queryByTestId("mind-map-node-inspector")).not.toBeInTheDocument();
});

test("keeps an expanded branch and canvas nodes in place while a proposal is promoted", async () => {
  const largeContent: MindMapRevisionContent = {
    nodes: [
      { id: "root", label: "Large map", order: 0, parentId: null },
      { id: "a", label: "Branch A", order: 0, parentId: "root" },
      { id: "b", label: "Branch B", order: 1, parentId: "root" },
      ...Array.from({ length: 13 }, (_, index) => ({
        id: `a-${index}`,
        label: `Leaf A ${index}`,
        order: index,
        parentId: "a",
      })),
      ...Array.from({ length: 13 }, (_, index) => ({
        id: `b-${index}`,
        label: `Leaf B ${index}`,
        order: index,
        parentId: "b",
      })),
    ],
    rootId: "root",
    generation,
    schemaVersion: 2,
  };
  const proposedContent: MindMapRevisionContent = {
    ...largeContent,
    nodes: [...largeContent.nodes, { id: "new-leaf", label: "AI leaf", order: 13, parentId: "a" }],
  };
  const proposal: MindMapEditProposal = {
    artifactId,
    baseRevisionId: firstRevisionId,
    content: proposedContent,
    edits: [{ label: "AI leaf", note: "", parentId: "a", type: "add_child" }],
    kind: "mind_map",
    request: "Extend branch A",
    runId: "00000000-0000-4000-8000-000000000006",
    summary: "Add a leaf",
    title: "Large map",
  };
  const updatedArtifact = artifact(secondRevisionId, 2, proposedContent);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ acceptedRevisionId: secondRevisionId, artifact: updatedArtifact }),
    ),
  );

  function PromotionHarness() {
    const [currentArtifact, setCurrentArtifact] = useState(
      artifact(firstRevisionId, 1, largeContent),
    );
    const [currentProposal, setCurrentProposal] = useState<MindMapEditProposal | null>(null);
    return (
      <>
        <button type="button" onClick={() => setCurrentProposal(proposal)}>
          Show proposal
        </button>
        <MindMapWorkspaceView
          artifact={currentArtifact}
          conversationId="00000000-0000-4000-8000-000000000005"
          draft={null}
          failureCode={null}
          onArtifactUpdated={setCurrentArtifact}
          onBack={vi.fn()}
          onProposalDismiss={() => setCurrentProposal(null)}
          onSuggestion={vi.fn()}
          pendingTitle={null}
          phase="idle"
          proposal={currentProposal}
          workspaceId={workspaceId}
        />
      </>
    );
  }

  renderWithIntl(<PromotionHarness />);
  const expandBranchA = (await screen.findAllByRole("button", { name: "展开分支" }))[0];
  if (!expandBranchA) throw new Error("Missing Branch A expand control");
  fireEvent.click(expandBranchA);
  expect(await screen.findByText("Leaf A 0")).toBeInTheDocument();
  const branchElement = screen.getByTestId("flow-node-a");

  fireEvent.click(screen.getByRole("button", { name: "Show proposal" }));
  expect(await screen.findByText("AI leaf")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "应用更改" }));

  await waitFor(() => expect(screen.queryByText("＋新增")).not.toBeInTheDocument());
  expect(screen.getByTestId("flow-node-a")).toBe(branchElement);
  expect(screen.getByText("Leaf A 0")).toBeInTheDocument();
  expect(screen.getByText("AI leaf")).toBeInTheDocument();
  await waitFor(() =>
    expect(localViewStorage.get(`spectra:mind-map-view:v1:${artifactId}:${secondRevisionId}`)).toBe(
      JSON.stringify({ collapsedIds: ["b"], focusRootId: null, mode: "canvas" }),
    ),
  );
});

test("searches the synchronized outline and reveals a result on the canvas", async () => {
  const searchableContent: MindMapRevisionContent = {
    nodes: [
      { id: "root", label: "Course", order: 0, parentId: null },
      { id: "branch", label: "Foundations", order: 0, parentId: "root" },
      {
        id: "target",
        label: "Backpropagation",
        note: "Gradient calculation",
        order: 0,
        parentId: "branch",
      },
    ],
    rootId: "root",
    generation,
    schemaVersion: 2,
  };

  renderWithIntl(view(artifact(firstRevisionId, 1, searchableContent)));
  fireEvent.click(screen.getByRole("button", { name: "大纲" }));
  expect(screen.getByTestId("mind-map-outline")).toBeInTheDocument();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "gradient" } });
  fireEvent.click(screen.getByRole("button", { name: /Backpropagation/ }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "导图" })).toHaveAttribute("aria-pressed", "true"),
  );
  expect(screen.getByTestId("flow-node-target")).toBeInTheDocument();
  expect(screen.getByTestId("mind-map-node-inspector")).toHaveTextContent("Backpropagation");
});

test("focuses one branch and returns to the previous full-map view", () => {
  const focusedContent: MindMapRevisionContent = {
    nodes: [
      { id: "root", label: "Course", order: 0, parentId: null },
      { id: "branch", label: "Foundations", order: 0, parentId: "root" },
      { id: "leaf", label: "Vectors", order: 0, parentId: "branch" },
      { id: "other", label: "Applications", order: 1, parentId: "root" },
    ],
    rootId: "root",
    generation,
    schemaVersion: 2,
  };

  renderWithIntl(view(artifact(firstRevisionId, 1, focusedContent)));
  fireEvent.click(screen.getByTestId("flow-node-branch"));
  fireEvent.click(
    within(screen.getByTestId("mind-map-node-inspector")).getByRole("button", {
      name: "只看此分支",
    }),
  );
  expect(screen.queryByTestId("flow-node-root")).not.toBeInTheDocument();
  expect(screen.queryByTestId("flow-node-other")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "返回完整导图" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "返回完整导图" }));
  expect(screen.getByTestId("flow-node-root")).toBeInTheDocument();
  expect(screen.getByTestId("flow-node-other")).toBeInTheDocument();
});

test("persists view state per revision and does not reuse it for a newer revision", async () => {
  const first = artifact(firstRevisionId, 1);
  const rendered = renderWithIntl(view(first));
  fireEvent.click(screen.getByRole("button", { name: "大纲" }));
  const firstKey = `spectra:mind-map-view:v1:${artifactId}:${firstRevisionId}`;
  await waitFor(() => expect(localViewStorage.get(firstKey)).toContain('"mode":"outline"'));

  rendered.unmount();
  const remounted = renderWithIntl(view(first));
  await waitFor(() => expect(screen.getByTestId("mind-map-outline")).toBeInTheDocument());

  remounted.rerender(view(artifact(secondRevisionId, 2)));
  await waitFor(() => expect(screen.getByTestId("mind-map-canvas")).toBeInTheDocument());
});

test("uses the shared Artifact generation presentation before map content arrives", () => {
  renderWithIntl(
    <MindMapWorkspaceView
      artifact={null}
      conversationId="00000000-0000-4000-8000-000000000005"
      draft={null}
      failureCode={null}
      onArtifactUpdated={vi.fn()}
      onBack={vi.fn()}
      onSuggestion={vi.fn()}
      pendingTitle="New map"
      phase="generating"
      workspaceId={workspaceId}
    />,
  );
  expect(screen.getByTestId("mind-map-generation-placeholder")).toHaveTextContent(
    "正在构建思维导图",
  );
});
