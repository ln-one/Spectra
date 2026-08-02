import { describe, expect, it } from "vitest";
import type { MindMapContent } from "./contract";
import { mindMapEditReducer } from "./editor";

const content: MindMapContent = {
  nodes: [
    { id: "root", label: "Root", order: 0, parentId: null },
    { id: "a", label: "A", order: 0, parentId: "root" },
    { id: "b", label: "B", order: 1, parentId: "root" },
    { id: "a1", label: "A1", order: 0, parentId: "a" },
  ],
  rootId: "root",
};

describe("mind map editor reducer", () => {
  it("adds a child and swaps sibling order", () => {
    const added = mindMapEditReducer(content, {
      type: "add_child",
      id: "a2",
      label: "A2",
      note: "Details",
      parentId: "a",
    });
    expect(added.nodes.find((node) => node.id === "a2")).toMatchObject({
      label: "A2",
      note: "Details",
      order: 1,
      parentId: "a",
    });
    const moved = mindMapEditReducer(added, { type: "move", direction: -1, id: "b" });
    expect(moved.nodes.find((node) => node.id === "b")?.order).toBe(0);
    expect(moved.nodes.find((node) => node.id === "a")?.order).toBe(1);
  });

  it("deletes a subtree but never deletes the root", () => {
    const deleted = mindMapEditReducer(content, { type: "delete_subtree", id: "a" });
    expect(deleted.nodes.map((node) => node.id)).toEqual(["root", "b"]);
    expect(mindMapEditReducer(content, { type: "delete_subtree", id: "root" })).toEqual(content);
  });
});
