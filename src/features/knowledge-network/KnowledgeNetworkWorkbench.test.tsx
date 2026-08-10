import { fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { renderWithIntl } from "../../../tests/render";
import { emptyKnowledgeNetworkTrace } from "./fixtures";
import { KnowledgeNetworkSourcesPanel } from "./KnowledgeNetworkWorkbench";
import { ZH_KNOWLEDGE_NETWORK_NODE_SELECTION_LABELS } from "./model";

vi.mock("./KnowledgeNetworkGraphView", () => ({
  KnowledgeNetworkGraphView: () => <div data-testid="knowledge-network-graph" />,
}));

test("renders the expanded source view toggle as a lightweight import-peer action", () => {
  const onSourceModeChange = vi.fn();
  renderWithIntl(
    <KnowledgeNetworkSourcesPanel
      citationFocus={null}
      focusRequest={null}
      graphPlan={{ layout: {}, nodeMetrics: {}, visibleEdges: [], visibleNodeIds: [] }}
      labels={{
        assistantGrounding: "基于资料",
        assistantSubtitle: "知识助手",
        assistantTitle: "对话",
        currentWorkspace: "当前 Workspace",
        importLabel: "导入",
        networkSummary: "1 个 Workspace · 1 个 Source",
        referencedWorkspace: "引用 Workspace",
        sourceListSummary: "1 个 Workspace · 1 个 Source",
        sourceTitle: "包含的资料",
        studioExpand: "展开",
        studioSubtitle: "创作工具",
        studioTitle: "创作工作台",
        switchToList: "切回资料列表",
        switchToNetwork: "在知识网络中查看",
        workspaceSourceStatus: "已引用",
        workspaceSourceType: "Workspace",
      }}
      onGraphSelect={vi.fn()}
      onSelect={vi.fn()}
      onSourceModeChange={onSourceModeChange}
      selectedId={null}
      selectionLabels={ZH_KNOWLEDGE_NETWORK_NODE_SELECTION_LABELS}
      shouldReduceMotion
      sourceEntries={[]}
      sourceMode="network"
      theme="light"
      trace={emptyKnowledgeNetworkTrace}
    />,
  );

  const toggle = screen.getByRole("button", { name: "切回资料列表" });
  const importControl = screen.getByRole("button", { name: "导入" });

  expect(toggle).toHaveAttribute("aria-pressed", "true");
  expect(toggle).toHaveClass(
    "workspace-sources-import-action",
    "rounded-full",
    "hover:bg-[var(--workspace-surface-muted)]",
  );
  expect(toggle).not.toHaveClass("border", "bg-[var(--studio-surface-subtle)]", "shadow-sm");
  expect(importControl).toHaveClass(
    "workspace-sources-import-action",
    "rounded-full",
    "hover:bg-[var(--workspace-surface-muted)]",
  );

  fireEvent.click(toggle);
  expect(onSourceModeChange).toHaveBeenCalledWith("list");
});
