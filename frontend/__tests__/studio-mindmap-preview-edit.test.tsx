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
  it("updates selected node when a canvas node is clicked", () => {
    const SelectionHarness = () => {
      const [selectedId, setSelectedId] = React.useState("root");
      return (
        <PreviewStep
          selectedId={selectedId}
          lastGeneratedAt={null}
          flowContext={buildFlowContext()}
          onSelectNode={setSelectedId}
        />
      );
    };

    render(<SelectionHarness />);

    expect(screen.getAllByText("进程管理").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("基本概念")).toHaveLength(1);

    fireEvent.pointerDown(screen.getAllByText("基本概念")[0]);
    fireEvent.click(screen.getAllByText("基本概念")[0]);

    expect(screen.getByText("当前选中节点")).toBeInTheDocument();
    expect(screen.getAllByText("基本概念")).toHaveLength(2);
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

    fireEvent.click(screen.getByRole("button", { name: "添加子节点" }));
    fireEvent.change(screen.getByPlaceholderText("例如：进程切换开销"), {
      target: { value: "进程切换开销" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("补充一句说明，后端会写入新节点摘要。"),
      {
        target: { value: "描述调度与上下文切换的额外成本" },
      }
    );

    fireEvent.click(screen.getByRole("button", { name: "确认新增" }));

    await waitFor(() => {
      expect(onStructuredRefineArtifact).toHaveBeenCalledWith({
        artifactId: "artifact-map-1",
        message: "进程切换开销",
        config: {
          selected_node_path: "root",
          manual_child_summary: "描述调度与上下文切换的额外成本",
        },
      });
    });
    expect(onSelectNode).toHaveBeenCalledWith("root-refine-2");
  });

  it("disables add-child action when artifact id is unavailable", () => {
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

    expect(screen.getByRole("button", { name: "添加子节点" })).toBeDisabled();
  });
});
