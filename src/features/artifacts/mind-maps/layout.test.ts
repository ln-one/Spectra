import { describe, expect, it } from "vitest";
import type { MindMapContent } from "./contract";
import {
  collapseMindMapToFirstLevel,
  countMindMapDescendants,
  createInitialMindMapCollapsedIds,
  getMindMapVisibleNodeIds,
  layoutMindMap,
  revealMindMapNode,
} from "./layout";

const content: MindMapContent = {
  nodes: [
    { id: "root", label: "中心主题", order: 0, parentId: null },
    { id: "a", label: "分支甲", order: 0, parentId: "root" },
    { id: "b", label: "分支乙", order: 1, parentId: "root" },
    { id: "c", label: "分支丙", order: 2, parentId: "root" },
    { id: "a1", label: "甲一", order: 0, parentId: "a" },
    { id: "a2", label: "甲二", order: 1, parentId: "a" },
    { id: "a11", label: "甲一一", order: 0, parentId: "a1" },
    { id: "b1", label: "乙一", order: 0, parentId: "b" },
  ],
  rootId: "root",
};

describe("mind map progressive layout", () => {
  it("balances stable first-level branches across both sides", () => {
    const first = layoutMindMap({ content });
    expect(first).toEqual(layoutMindMap({ content }));
    const byId = new Map(first.map((node) => [node.id, node]));
    expect(byId.get("root")?.side).toBe("center");
    expect(byId.get("a")?.side).toBe("right");
    expect(byId.get("b")?.side).toBe("left");
    expect(new Set([byId.get("a")?.side, byId.get("b")?.side, byId.get("c")?.side])).toEqual(
      new Set(["left", "right"]),
    );
    const rootCenter = (byId.get("root")?.position.x ?? 0) + 112;
    for (const node of first) {
      const center = node.position.x + node.width / 2;
      if (node.side === "left") expect(center).toBeLessThan(rootCenter);
      if (node.side === "right") expect(center).toBeGreaterThan(rootCenter);
    }
    for (const node of content.nodes) {
      if (!node.parentId || node.parentId === "root") continue;
      expect(byId.get(node.id)?.side).toBe(byId.get(node.parentId)?.side);
    }
  });

  it("uses level-specific sizes and does not overlap visible cards", () => {
    const positioned = layoutMindMap({ content });
    expect(positioned.find((node) => node.id === "root")).toMatchObject({
      height: 72,
      width: 224,
    });
    expect(positioned.find((node) => node.id === "a")).toMatchObject({ height: 60, width: 200 });
    expect(positioned.find((node) => node.id === "a1")).toMatchObject({
      height: 52,
      width: 176,
    });
    for (let leftIndex = 0; leftIndex < positioned.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < positioned.length; rightIndex += 1) {
        const left = positioned[leftIndex];
        const right = positioned[rightIndex];
        if (!left || !right) continue;
        const separated =
          left.position.x + left.width <= right.position.x ||
          right.position.x + right.width <= left.position.x ||
          left.position.y + left.height <= right.position.y ||
          right.position.y + right.height <= left.position.y;
        expect(separated, `${left.id} overlaps ${right.id}`).toBe(true);
      }
    }
  });

  it("removes only collapsed descendants and reports the full hidden count", () => {
    const collapsedIds = new Set(["a"]);
    expect(getMindMapVisibleNodeIds({ collapsedIds, content })).toEqual([
      "root",
      "a",
      "b",
      "b1",
      "c",
    ]);
    expect(countMindMapDescendants(content, "a")).toBe(3);
    expect(content.nodes).toHaveLength(8);
  });

  it("chooses the deepest complete layer that fits the initial budget", () => {
    expect(createInitialMindMapCollapsedIds({ content, visibleBudget: 5 })).toEqual(
      new Set(["a", "b"]),
    );
    expect(createInitialMindMapCollapsedIds({ content, visibleBudget: 8 })).toEqual(new Set());
  });

  it("collapses the map to its first-level branches", () => {
    const collapsed = collapseMindMapToFirstLevel({ content });
    expect(collapsed).toEqual(new Set(["a", "b"]));
    expect(getMindMapVisibleNodeIds({ collapsedIds: collapsed, content })).toEqual([
      "root",
      "a",
      "b",
      "c",
    ]);
  });

  it("reveals ancestor branches and lays out a focused subtree around its own root", () => {
    const revealed = revealMindMapNode({
      collapsedIds: new Set(["a", "a1", "b"]),
      content,
      nodeId: "a11",
    });
    expect(revealed).toEqual(new Set(["b"]));
    const focused = layoutMindMap({ content, focusRootId: "a" });
    expect(focused.map((node) => node.id)).toEqual(["a", "a1", "a11", "a2"]);
    expect(focused.find((node) => node.id === "a")).toMatchObject({ depth: 0, side: "center" });
  });
});
