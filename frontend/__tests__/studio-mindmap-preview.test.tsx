import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ToolFlowContext } from "@/components/project/features/studio/tools";
import { PreviewStep } from "@/components/project/features/studio/tools/mindmap/PreviewStep";

function buildFlowContext(
  overrides: Partial<ToolFlowContext> = {}
): ToolFlowContext {
  return {
    capabilityStatus: "backend_ready",
    capabilityReason: "Loaded backend mindmap.",
    cardCapability: {
      id: "knowledge_mindmap",
      title: "思维导图",
      readiness: "foundation_ready",
      governance_tag: "borrow",
      cleanup_priority: "p1",
      surface_strategy: "graph_surface_adapter",
      frozen: false,
      health_report: {
        authority_integrity: 4,
        builder_thinness: 3,
        surface_maturity: 2,
        fallback_residue: 4,
        test_coverage: 2,
        replaceability: 5,
        summary: "优先借成熟 graph editor substrate，不再继续手搓 canvas/tree 双实现。",
      },
      context_mode: "artifact",
      execution_mode: "artifact_create",
      primary_capabilities: [],
      related_capabilities: [],
      artifact_types: [],
      requires_source_artifact: false,
      supports_chat_refine: true,
      supports_selection_context: true,
      config_fields: [],
      actions: [],
    },
    resolvedArtifact: {
      artifactId: "mindmap-artifact-1",
      artifactType: "mindmap",
      contentKind: "json",
      content: {
        kind: "mindmap",
        nodes: [
          {
            id: "root",
            label: "牛顿第二定律",
            children: [
              { id: "child-1", label: "合力" },
              { id: "child-2", label: "加速度" },
            ],
          },
        ],
      },
    },
    onStructuredRefineArtifact: jest.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
}

describe("mindmap preview", () => {
  it("renders graph surface adapter and retains refine controls", () => {
    render(
      <PreviewStep
        selectedId="root"
        lastGeneratedAt="2026-04-18T09:00:00.000Z"
        flowContext={buildFlowContext()}
        onSelectNode={() => undefined}
      />
    );

    expect(screen.getByText("导图工作面")).toBeInTheDocument();
    expect(screen.getByText("Stable graph surface")).toBeInTheDocument();
    expect(screen.getByText("治理：借底座 · 清理优先级：P1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加子节点" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存名称" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "调整父节点" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "折叠当前节点" })).toBeInTheDocument();
    expect(screen.getByText("子节点：2")).toBeInTheDocument();
    expect(screen.getAllByText("牛顿第二定律").length).toBeGreaterThan(0);
  });

  it("submits child refinement against the selected node", async () => {
    const onStructuredRefineArtifact = jest
      .fn()
      .mockResolvedValue({ ok: true, insertedNodeId: "child-3" });
    const onSelectNode = jest.fn();

    render(
      <PreviewStep
        selectedId="root"
        lastGeneratedAt="2026-04-18T09:00:00.000Z"
        flowContext={buildFlowContext({ onStructuredRefineArtifact })}
        onSelectNode={onSelectNode}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "添加子节点" }));
    fireEvent.change(screen.getByPlaceholderText("例如：进程切换开销"), {
      target: { value: "质量" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认新增" }));

    await waitFor(() => {
      expect(onStructuredRefineArtifact).toHaveBeenCalledWith({
        artifactId: "mindmap-artifact-1",
        message: "质量",
        refineMode: "structured_refine",
        selectionAnchor: {
          scope: "node",
          anchor_id: "root",
          artifact_id: "mindmap-artifact-1",
          label: "牛顿第二定律",
        },
        config: {
          selected_node_path: "root",
          manual_child_summary: undefined,
        },
      });
      expect(onSelectNode).toHaveBeenCalledWith("child-3");
    });
  });

  it("submits rename and delete operations through structured refine", async () => {
    const onStructuredRefineArtifact = jest
      .fn()
      .mockResolvedValue({ ok: true });

    render(
      <PreviewStep
        selectedId="child-1"
        lastGeneratedAt="2026-04-18T09:00:00.000Z"
        flowContext={buildFlowContext({ onStructuredRefineArtifact })}
        onSelectNode={() => undefined}
      />
    );

    fireEvent.change(screen.getByPlaceholderText("合力"), {
      target: { value: "质量" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存名称" }));

    await waitFor(() => {
      expect(onStructuredRefineArtifact).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          artifactId: "mindmap-artifact-1",
          message: "质量",
          config: expect.objectContaining({
            selected_node_path: "child-1",
            node_operation: "rename",
          }),
        })
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "删除当前节点" }));

    await waitFor(() => {
      expect(onStructuredRefineArtifact).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          artifactId: "mindmap-artifact-1",
          message: "合力",
          config: expect.objectContaining({
            selected_node_path: "child-1",
            node_operation: "delete",
          }),
        })
      );
    });
  });
});
