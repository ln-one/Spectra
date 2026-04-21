import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PreviewStep } from "@/components/project/features/studio/tools/mindmap/PreviewStep";
import type { ToolFlowContext } from "@/components/project/features/studio/tools";

function buildFlowContext(
  overrides: Partial<ToolFlowContext> = {}
): ToolFlowContext {
  return {
    capabilityStatus: "backend_ready",
    capabilityReason: "Loaded backend mindmap.",
    resolvedArtifact: {
      artifactId: "artifact-map-1",
      artifactType: "mindmap",
      contentKind: "json",
      content: {
        kind: "mindmap",
        nodes: [
          {
            id: "root",
            title: "进程管理",
            children: [{ id: "child-1", title: "基本概念", children: [] }],
          },
        ],
      },
    },
    latestArtifacts: [],
    ...overrides,
  };
}

describe("mindmap preview child insertion", () => {
  it("updates selected node when a canvas node is clicked", async () => {
    const SelectionHarness = () => {
      const [selectedId, setSelectedId] = React.useState("root");
      return (
        <>
          <PreviewStep
            selectedId={selectedId}
            lastGeneratedAt={null}
            flowContext={buildFlowContext()}
            onSelectNode={setSelectedId}
          />
          <div data-testid="selected-node">{selectedId}</div>
        </>
      );
    };

    render(<SelectionHarness />);

    expect(screen.getByText("进程管理")).toBeInTheDocument();
    fireEvent.click(screen.getAllByText("基本概念")[0]);
    await waitFor(() => {
      expect(screen.getByTestId("selected-node")).toHaveTextContent("child-1");
    });
  });

  it("submits structured refine request for selected node", async () => {
    const onStructuredRefineArtifact = jest.fn().mockResolvedValue({
      ok: true,
      artifactId: "artifact-map-2",
      effectiveSessionId: "session-1",
      insertedNodeId: "root-refine-2",
    });
    const onSelectNode = jest.fn();

    render(
      <PreviewStep
        selectedId="root"
        lastGeneratedAt={null}
        flowContext={buildFlowContext({ onStructuredRefineArtifact })}
        onSelectNode={onSelectNode}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "新增子节点" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "新增子节点" }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("子节点名称")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText("子节点名称"), {
      target: { value: "进程切换开销" },
    });
    fireEvent.change(screen.getByPlaceholderText("子节点说明（可选）"), {
      target: { value: "描述调度与上下文切换的额外成本" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认新增" }));

    await waitFor(() => {
      expect(onStructuredRefineArtifact).toHaveBeenCalledWith({
        artifactId: "artifact-map-1",
        message: "进程切换开销",
        refineMode: "structured_refine",
        selectionAnchor: {
          scope: "node",
          anchor_id: "root",
          artifact_id: "artifact-map-1",
          label: "进程管理",
        },
        config: {
          selected_node_path: "root",
          manual_child_summary: "描述调度与上下文切换的额外成本",
        },
      });
    });
    expect(onSelectNode).toHaveBeenCalledWith("root-refine-2");
  });

  it("disables add-child action when artifact id is unavailable", async () => {
    render(
      <PreviewStep
        selectedId="root"
        lastGeneratedAt={null}
        flowContext={{
          capabilityStatus: "backend_ready",
          capabilityReason: "Loaded backend mindmap.",
          resolvedArtifact: {
            artifactId: "",
            artifactType: "mindmap",
            contentKind: "json",
            content: {
              kind: "mindmap",
              nodes: [{ id: "root", title: "进程管理", children: [] }],
            },
          },
          latestArtifacts: [],
        }}
        onSelectNode={() => undefined}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "新增子节点" })).toBeDisabled();
    });
  });

  it("hides the inspector when clicking blank canvas or switching back to preview", async () => {
    const { container } = render(
      <PreviewStep
        selectedId="root"
        lastGeneratedAt={null}
        flowContext={buildFlowContext({
          onStructuredRefineArtifact: jest.fn().mockResolvedValue({ ok: true }),
        })}
        onSelectNode={() => undefined}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    fireEvent.click(screen.getByRole("button", { name: "新增子节点" }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("子节点名称")).toBeInTheDocument();
    });

    const pane = container.querySelector(".react-flow__pane");
    expect(pane).not.toBeNull();
    fireEvent.click(pane!);
    await waitFor(() => {
      expect(screen.queryByPlaceholderText("子节点名称")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "新增子节点" }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("子节点名称")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    fireEvent.click(screen.getByRole("button", { name: "完成" }));
    await waitFor(() => {
      expect(screen.queryByPlaceholderText("子节点名称")).not.toBeInTheDocument();
    });
  });
});
